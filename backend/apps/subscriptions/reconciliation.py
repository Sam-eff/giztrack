import logging
from decimal import Decimal, InvalidOperation
from datetime import timedelta

from django.db.models import Q
from django.utils import timezone

from . import paystack
from .models import PaymentHistory, Subscription
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


def _as_dict(value):
    return value if isinstance(value, dict) else {}


def _transaction_plan_code(transaction):
    candidates = [
        _as_dict(transaction.get("plan_object")),
        _as_dict(transaction.get("plan")),
    ]
    return next(
        (candidate.get("plan_code") for candidate in candidates if candidate.get("plan_code")),
        "",
    )


def _paid_at(transaction):
    return (
        _parse_datetime(transaction.get("paid_at"))
        or _parse_datetime(transaction.get("paidAt"))
        or _parse_datetime(transaction.get("transaction_date"))
        or _parse_datetime(transaction.get("created_at"))
        or _parse_datetime(transaction.get("createdAt"))
    )


def _amount_from_kobo(value):
    try:
        return Decimal(str(value or 0)) / Decimal("100")
    except (InvalidOperation, TypeError, ValueError):
        return Decimal("0")


def _plan_amount_kobo(subscription):
    if not subscription.plan or subscription.plan.price is None:
        return None
    return int(subscription.plan.price * Decimal("100"))


def _remote_customer_id(raw):
    customer = _as_dict(raw.get("customer"))
    return customer.get("id")


def _payment_history_window(renewal_anchor):
    started_at = (
        renewal_anchor - timedelta(days=3)
        if renewal_anchor
        else timezone.now() - timedelta(days=45)
    )
    ended_at = timezone.now() + timedelta(days=1)
    return started_at, ended_at


def _has_payment_history_for_window(subscription, renewal_anchor):
    started_at, ended_at = _payment_history_window(renewal_anchor)
    return PaymentHistory.objects.filter(
        shop=subscription.shop,
        paid_at__gte=started_at,
        paid_at__lte=ended_at,
    ).exists()


def _backfill_payment_history_from_transactions(
    subscription,
    remote,
    renewal_anchor,
):
    raw = remote.get("raw") or {}
    customer_id = _remote_customer_id(raw)
    if not customer_id:
        return {"outcome": "skipped", "reason": "remote subscription has no customer id"}

    amount_kobo = _plan_amount_kobo(subscription)
    started_at, ended_at = _payment_history_window(renewal_anchor)

    transactions = paystack.list_transactions(
        customer_id=customer_id,
        status="success",
        date_from=started_at.isoformat(),
        date_to=ended_at.isoformat(),
        amount=amount_kobo,
    )

    local_plan_code = subscription.plan.paystack_plan_code if subscription.plan else ""
    candidates = []
    for transaction in transactions:
        if not isinstance(transaction, dict):
            continue

        reference = (transaction.get("reference") or "").strip()
        if not reference:
            continue
        existing_payment = PaymentHistory.objects.filter(
            paystack_reference=reference
        ).first()
        if existing_payment:
            if existing_payment.shop_id == subscription.shop_id:
                return {
                    "outcome": "already_present",
                    "reference": reference,
                    "paid_at": existing_payment.paid_at,
                    "amount": existing_payment.amount,
                }
            continue

        paid_at = _paid_at(transaction)
        if not paid_at or paid_at < started_at or paid_at > ended_at:
            continue

        plan_code = _transaction_plan_code(transaction)
        if plan_code and local_plan_code and plan_code != local_plan_code:
            continue

        amount = _amount_from_kobo(transaction.get("amount"))
        if amount <= 0:
            continue

        candidates.append((paid_at, reference, amount))

    if not candidates:
        return {"outcome": "skipped", "reason": "no matching successful transaction"}

    candidates.sort(reverse=True)
    paid_at, reference, amount = candidates[0]
    payment, created = PaymentHistory.objects.get_or_create(
        paystack_reference=reference,
        defaults={
            "shop": subscription.shop,
            "plan": subscription.plan,
            "amount": amount,
            "paid_at": paid_at,
        },
    )
    if not created and payment.shop_id != subscription.shop_id:
        return {"outcome": "skipped", "reason": "transaction belongs to another shop"}

    return {
        "outcome": "created" if created else "already_present",
        "reference": reference,
        "paid_at": paid_at,
        "amount": amount,
    }


def reconcile_subscription(subscription, dry_run=False):
    """
    Reconcile one local subscription without granting access from an ambiguous
    Paystack state. Only an active remote subscription with a future payment
    date may extend local access.
    """
    remote = paystack.find_subscription(
        subscription_code=subscription.paystack_subscription_code or None,
        customer_code=subscription.paystack_customer_code,
        customer_email=subscription.shop.email,
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
    previous_paid_through = local_paid_through
    next_status = subscription.status
    next_period_end = local_paid_through
    payment_history = {"outcome": "not_attempted"}

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
    remote_customer = raw.get("customer")
    if not isinstance(remote_customer, dict):
        remote_customer = {}
    next_customer_code = (
        remote_customer.get("customer_code")
        or subscription.paystack_customer_code
    )
    changed = any(
        [
            subscription.status != next_status,
            subscription.current_period_end != next_period_end,
            subscription.paystack_customer_code != next_customer_code,
            subscription.paystack_subscription_code != next_subscription_code,
            subscription.paystack_email_token != next_email_token,
        ]
    )
    should_recover_payment_history = False
    renewal_anchor = None

    if (
        not dry_run
        and remote_status == "active"
        and next_status == Subscription.Status.ACTIVE
        and next_period_end
    ):
        if changed and (
            not previous_paid_through
            or next_period_end > previous_paid_through
        ):
            should_recover_payment_history = True
            renewal_anchor = previous_paid_through
        elif not changed:
            renewal_anchor = subscription.current_period_start
            should_recover_payment_history = bool(
                renewal_anchor
                and not _has_payment_history_for_window(
                    subscription,
                    renewal_anchor,
                )
            )

    if changed and not dry_run:
        previous_period_end = subscription.current_period_end
        subscription.status = next_status
        subscription.current_period_end = next_period_end
        subscription.paystack_customer_code = next_customer_code
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
                "paystack_customer_code",
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

    if should_recover_payment_history:
        try:
            payment_history = _backfill_payment_history_from_transactions(
                subscription,
                remote,
                renewal_anchor,
            )
        except Exception as exc:
            payment_history = {
                "outcome": "failed",
                "reason": str(exc),
            }

        if payment_history["outcome"] in {"created", "already_present"}:
            logger.info(
                "Paystack reconciliation payment history %s for shop=%s reference=%s",
                payment_history["outcome"],
                subscription.shop_id,
                payment_history.get("reference", ""),
            )
        else:
            logger.warning(
                "Paystack reconciliation could not recover payment history "
                "for active shop=%s: %s",
                subscription.shop_id,
                payment_history.get("reason", payment_history["outcome"]),
            )

    return {
        "outcome": "updated" if changed else "unchanged",
        "reason": remote_status,
        "shop_id": subscription.shop_id,
        "status": next_status,
        "period_end": next_period_end,
        "subscription_code": next_subscription_code,
        "payment_history": payment_history,
        "dry_run": dry_run,
    }


def due_subscriptions_queryset():
    now = timezone.now()
    cutoff = now + timedelta(hours=6)
    oldest_recoverable_period = now - timedelta(days=45)
    return (
        Subscription.objects.select_related("shop", "plan")
        .filter(status__in=[Subscription.Status.ACTIVE, Subscription.Status.EXPIRED])
        .filter(
            plan__paystack_plan_code__isnull=False,
        )
        .exclude(plan__paystack_plan_code="")
        .filter(
            Q(
                current_period_end__gte=oldest_recoverable_period,
                current_period_end__lte=cutoff,
            )
            | Q(
                shop__subscription_expires_at__gte=oldest_recoverable_period,
                shop__subscription_expires_at__lte=cutoff,
            )
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
