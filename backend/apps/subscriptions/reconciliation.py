import logging
from datetime import timedelta

from django.db.models import Q
from django.utils import timezone

from . import paystack
from .models import Subscription
from .webhook import _parse_datetime

logger = logging.getLogger(__name__)

REMOTE_STATUSES = ["active", "non-renewing", "attention", "completed", "cancelled"]


def _paid_through(subscription):
    dates = [
        value
        for value in (
            subscription.current_period_end,
            subscription.shop.subscription_expires_at,
        )
        if value
    ]
    return max(dates) if dates else None


def _remote_period_end(raw):
    subscription_payload = raw.get("subscription")
    if not isinstance(subscription_payload, dict):
        subscription_payload = {}

    return (
        _parse_datetime(raw.get("next_payment_date"))
        or _parse_datetime(raw.get("nextPaymentDate"))
        or _parse_datetime(subscription_payload.get("next_payment_date"))
    )


def reconcile_subscription(subscription, dry_run=False):
    """
    Reconcile one local subscription without granting access from an ambiguous
    Paystack state. Only an active remote subscription with a future payment
    date may extend local access.
    """
    remote = paystack.find_subscription(
        subscription_code=subscription.paystack_subscription_code or None,
        customer_code=subscription.paystack_customer_code,
        plan_code=subscription.plan.paystack_plan_code if subscription.plan else None,
        statuses=REMOTE_STATUSES,
    )
    if not remote:
        return {
            "outcome": "skipped",
            "reason": "no matching Paystack subscription",
            "shop_id": subscription.shop_id,
        }

    now = timezone.now()
    raw = remote.get("raw") or {}
    remote_status = (remote.get("status") or "").strip().lower()
    remote_period_end = _remote_period_end(raw)
    local_paid_through = _paid_through(subscription)
    next_status = subscription.status
    next_period_end = local_paid_through

    if remote_status == "active":
        if not remote_period_end or remote_period_end <= now:
            return {
                "outcome": "skipped",
                "reason": "active remote subscription has no future next payment date",
                "shop_id": subscription.shop_id,
            }
        next_period_end = max(
            [value for value in (local_paid_through, remote_period_end) if value]
        )
        if subscription.status != Subscription.Status.CANCELLED:
            next_status = Subscription.Status.ACTIVE
    elif remote_status == "non-renewing":
        next_status = Subscription.Status.CANCELLED
        if remote_period_end and remote_period_end > now:
            next_period_end = max(
                [value for value in (local_paid_through, remote_period_end) if value]
            )
    elif remote_status == "attention":
        next_status = (
            Subscription.Status.ACTIVE
            if local_paid_through and local_paid_through > now
            else Subscription.Status.EXPIRED
        )
    elif remote_status in {"completed", "cancelled"}:
        next_status = Subscription.Status.CANCELLED
    else:
        return {
            "outcome": "skipped",
            "reason": f"unsupported Paystack status: {remote_status or 'missing'}",
            "shop_id": subscription.shop_id,
        }

    next_subscription_code = (
        remote.get("subscription_code") or subscription.paystack_subscription_code
    )
    next_email_token = remote.get("email_token") or subscription.paystack_email_token
    changed = any(
        [
            subscription.status != next_status,
            subscription.current_period_end != next_period_end,
            subscription.paystack_subscription_code != next_subscription_code,
            subscription.paystack_email_token != next_email_token,
        ]
    )

    if changed and not dry_run:
        previous_period_end = subscription.current_period_end
        subscription.status = next_status
        subscription.current_period_end = next_period_end
        subscription.paystack_subscription_code = next_subscription_code
        subscription.paystack_email_token = next_email_token
        if (
            next_period_end
            and previous_period_end
            and next_period_end > previous_period_end
        ):
            subscription.current_period_start = previous_period_end
        subscription.save(
            update_fields=[
                "status",
                "current_period_start",
                "current_period_end",
                "paystack_subscription_code",
                "paystack_email_token",
                "updated_at",
            ]
        )

        if next_period_end and (
            not subscription.shop.subscription_expires_at
            or next_period_end > subscription.shop.subscription_expires_at
        ):
            subscription.shop.subscription_expires_at = next_period_end
            subscription.shop.save(update_fields=["subscription_expires_at"])

    return {
        "outcome": "updated" if changed else "unchanged",
        "reason": remote_status,
        "shop_id": subscription.shop_id,
        "status": next_status,
        "period_end": next_period_end,
        "subscription_code": next_subscription_code,
        "dry_run": dry_run,
    }


def due_subscriptions_queryset():
    cutoff = timezone.now() + timedelta(hours=6)
    return (
        Subscription.objects.select_related("shop", "plan")
        .filter(status__in=[Subscription.Status.ACTIVE, Subscription.Status.EXPIRED])
        .filter(
            Q(paystack_customer_code__gt="")
            | Q(paystack_subscription_code__gt="")
        )
        .filter(
            Q(current_period_end__lte=cutoff)
            | Q(shop__subscription_expires_at__lte=cutoff)
            | Q(
                current_period_end__isnull=True,
                shop__subscription_expires_at__isnull=True,
            )
        )
    )


def reconcile_due_subscriptions():
    summary = {"checked": 0, "updated": 0, "unchanged": 0, "skipped": 0, "failed": 0}

    for subscription in due_subscriptions_queryset().iterator():
        summary["checked"] += 1
        try:
            result = reconcile_subscription(subscription)
        except Exception:
            summary["failed"] += 1
            logger.exception(
                "Scheduled Paystack reconciliation failed for shop=%s",
                subscription.shop_id,
            )
            continue

        outcome = result["outcome"]
        summary[outcome] += 1

    logger.info("Scheduled Paystack reconciliation finished: %s", summary)
    return summary
