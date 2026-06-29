"""
Paystack sends POST events to /api/v1/subscriptions/webhook/
This module handles each event type and updates the database accordingly.
"""
import calendar
import hashlib
import hmac
import logging
from decimal import Decimal, InvalidOperation
from datetime import datetime

from django.conf import settings
from django.db import transaction
from django.utils import timezone

from apps.shops.models import Shop
from .models import Subscription, PaymentHistory, Plan

logger = logging.getLogger(__name__)


class WebhookProcessingError(Exception):
    pass


def verify_signature(request):
    """
    Validates that the webhook truly came from Paystack.
    Paystack signs every webhook with your secret key.
    """
    secret_key = (settings.PAYSTACK_SECRET_KEY or "").strip()
    if not secret_key:
        logger.error("Paystack webhook rejected because PAYSTACK_SECRET_KEY is not configured.")
        return False

    paystack_signature = request.headers.get("x-paystack-signature", "")
    computed = hmac.new(
        secret_key.encode("utf-8"),
        request.body,
        hashlib.sha512,
    ).hexdigest()
    verified = hmac.compare_digest(paystack_signature, computed)
    if not verified:
        logger.warning(
            "Paystack webhook signature verification failed. "
            "Header signature: %s, Computed: %s",
            paystack_signature, computed
        )
    return verified


def handle_event(event_type, data):
    """Routes incoming webhook events to the right handler."""
    handlers = {
        "subscription.create": on_subscription_create,
        "subscription.not_renew": on_subscription_not_renew,
        "subscription.disable": on_subscription_disable,
        "charge.success": on_payment_success,
        # Kept for compatibility, although Paystack documents invoice.update.
        "invoice.payment_success": on_invoice_payment_success,
        "invoice.update": on_invoice_update,
        "invoice.payment_failed": on_payment_failed,
    }
    handler = handlers.get(event_type)
    if handler:
        logger.info("Handling Paystack event: %s", event_type)
        return handler(data)

    logger.debug("Ignoring unhandled Paystack event: %s", event_type)
    return "ignored"


def _as_dict(value):
    return value if isinstance(value, dict) else {}


def _subscription_payload(data):
    return _as_dict(data.get("subscription"))


def _customer_payload(data):
    return _as_dict(data.get("customer"))


def _transaction_payload(data):
    return _as_dict(data.get("transaction"))


def _subscription_code(data):
    raw_subscription = data.get("subscription")
    string_subscription = (
        raw_subscription
        if isinstance(raw_subscription, str) and raw_subscription.startswith("SUB_")
        else ""
    )
    return (
        data.get("subscription_code")
        or _subscription_payload(data).get("subscription_code")
        or string_subscription
        or ""
    )


def event_key(data):
    """Returns a non-sensitive identifier for webhook audit records."""
    transaction_payload = _transaction_payload(data)
    return str(
        data.get("reference")
        or transaction_payload.get("reference")
        or data.get("invoice_code")
        or _subscription_code(data)
        or _customer_payload(data).get("customer_code")
        or ""
    )[:200]


def _parse_datetime(value):
    if not value:
        return None
    if isinstance(value, datetime):
        return value
    if not isinstance(value, str):
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except Exception:
        return None


def _add_months(value, months):
    target_month = value.month - 1 + months
    year = value.year + target_month // 12
    month = target_month % 12 + 1
    day = min(value.day, calendar.monthrange(year, month)[1])
    return value.replace(year=year, month=month, day=day)


def _calculate_period_end(period_start, interval):
    if not period_start:
        return None

    if interval == "yearly":
        return _add_months(period_start, 12)
    return _add_months(period_start, 1)


def _customer_matches(subscription, customer_code):
    if not customer_code or not subscription.paystack_customer_code:
        return True
    return customer_code == subscription.paystack_customer_code


def _has_established_paid_subscription(subscription):
    return bool(
        subscription.paystack_subscription_code
        or subscription.paystack_email_token
        or subscription.current_period_end
        or subscription.shop.subscription_expires_at
    )


def _is_existing_subscription_charge(subscription, customer_code):
    return (
        subscription.status in {
            Subscription.Status.ACTIVE,
            Subscription.Status.CANCELLED,
            Subscription.Status.EXPIRED,
        }
        and _has_established_paid_subscription(subscription)
        and _customer_matches(subscription, customer_code)
    )


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


def _resolve_plan(data):
    metadata = _as_dict(data.get("metadata"))
    plan_id = metadata.get("plan_id")
    if plan_id:
        try:
            return Plan.objects.get(id=int(plan_id))
        except (Plan.DoesNotExist, TypeError, ValueError):
            pass

    candidates = [
        _as_dict(data.get("plan_object")),
        _as_dict(data.get("plan")),
        _as_dict(_subscription_payload(data).get("plan")),
    ]
    plan_code = next(
        (candidate.get("plan_code") for candidate in candidates if candidate.get("plan_code")),
        "",
    )
    if plan_code:
        try:
            return Plan.objects.get(paystack_plan_code=plan_code)
        except Plan.DoesNotExist:
            pass

    return None


def _resolve_subscription(data, plan=None):
    metadata = _as_dict(data.get("metadata"))
    shop_id = metadata.get("shop_id")
    if shop_id:
        try:
            return Subscription.objects.select_related("shop", "plan").get(shop_id=int(shop_id))
        except (Subscription.DoesNotExist, TypeError, ValueError):
            pass

    # Try by subscription_code — most reliable for renewal events
    subscription_code = _subscription_code(data)
    if subscription_code:
        try:
            return Subscription.objects.select_related("shop", "plan").get(
                paystack_subscription_code=subscription_code
            )
        except Subscription.DoesNotExist:
            pass

    customer = _customer_payload(data)
    customer_code = customer.get("customer_code")
    if customer_code:
        try:
            return Subscription.objects.select_related("shop", "plan").get(
                paystack_customer_code=customer_code
            )
        except Subscription.DoesNotExist:
            pass

    if plan:
        customer_email = customer.get("email")
        if customer_email:
            try:
                shop = Shop.objects.get(email=customer_email)
                subscription, _ = Subscription.objects.select_related("shop", "plan").get_or_create(
                    shop=shop,
                    defaults={"plan": plan, "status": Subscription.Status.PENDING},
                )
                return subscription
            except Shop.DoesNotExist:
                pass

    return None


def activate_subscription_from_transaction(data):
    metadata = _as_dict(data.get("metadata"))
    subscription_payload = _subscription_payload(data)
    transaction_payload = _transaction_payload(data)
    customer = _customer_payload(data)
    reference = data.get("reference") or transaction_payload.get("reference", "")
    amount_kobo = data.get("amount") or transaction_payload.get("amount") or 0
    paid_at = (
        _parse_datetime(data.get("paid_at"))
        or _parse_datetime(transaction_payload.get("paid_at"))
        or timezone.now()
    )
    plan = _resolve_plan(data)
    subscription = _resolve_subscription(data, plan=plan)
    if not subscription:
        return "unresolved"

    subscription_code = (
        _subscription_code(data)
        or subscription.paystack_subscription_code
    )
    email_token = (
        data.get("email_token")
        or subscription_payload.get("email_token")
        or subscription.paystack_email_token
    )
    checkout_token = metadata.get("checkout_token", "")
    customer_code = customer.get("customer_code", "")
    is_recurring_charge_payload = bool(_subscription_code(data))
    is_known_recurring_charge = bool(
        subscription_code
        and (
            (subscription.paystack_subscription_code and subscription_code == subscription.paystack_subscription_code)
            or (
                is_recurring_charge_payload
                and (
                    not subscription.paystack_subscription_code
                    or _customer_matches(subscription, customer_code)
                )
            )
        )
    )
    is_existing_subscription_charge = _is_existing_subscription_charge(subscription, customer_code)

    is_pending_checkout_charge = False
    if subscription.has_pending_checkout and not is_known_recurring_charge:
        if (
            is_existing_subscription_charge
            and checkout_token
            and checkout_token != subscription.pending_checkout_token
        ):
            # A pending upgrade checkout must not block the current plan's
            # recurring charge when Paystack reuses old checkout metadata.
            pass
        elif checkout_token:
            if subscription.pending_checkout_token != checkout_token:
                return "ignored"
            if (
                subscription.pending_checkout_reference
                and reference
                and subscription.pending_checkout_reference != reference
            ):
                return "ignored"
            is_pending_checkout_charge = True
        elif reference and subscription.pending_checkout_reference == reference:
            is_pending_checkout_charge = True
        elif metadata.get("checkout_kind") == "subscription_checkout":
            return "ignored"

        if is_pending_checkout_charge:
            if subscription.pending_plan_id and plan and subscription.pending_plan_id != plan.id:
                return "ignored"
            if not plan and subscription.pending_plan_id:
                plan = subscription.pending_plan
            if not plan:
                return "ignored"
    elif checkout_token and not is_known_recurring_charge:
        # Paystack carries over the original checkout metadata on auto-renewal
        # charge.success events. Accept this only for shops that already had a
        # paid subscription relationship; otherwise stale checkout links remain
        # ignored after users cancel a pending checkout.
        if not is_existing_subscription_charge:
            return "ignored"

    if plan and subscription.plan_id != plan.id:
        subscription.plan = plan

    if customer_code and subscription.paystack_customer_code != customer_code:
        subscription.paystack_customer_code = customer_code

    period_start = (
        _parse_datetime(data.get("period_start"))
        or _parse_datetime(data.get("paid_at"))
        or _parse_datetime(data.get("created_at"))
        or _parse_datetime(data.get("createdAt"))
        or timezone.now()
    )
    candidate_period_end = (
        _parse_datetime(subscription_payload.get("next_payment_date"))
        or _parse_datetime(data.get("next_payment_date"))
        or _parse_datetime(data.get("nextPaymentDate"))
    )
    invoice_period_end = _parse_datetime(data.get("period_end"))
    if not candidate_period_end and invoice_period_end and invoice_period_end > period_start:
        candidate_period_end = invoice_period_end
    if not candidate_period_end:
        candidate_period_end = _calculate_period_end(
            period_start,
            subscription.plan.interval if subscription.plan else "monthly",
        )

    existing_paid_through = _paid_through(subscription)
    period_end = max(
        value
        for value in (existing_paid_through, candidate_period_end)
        if value
    )
    if (
        existing_paid_through
        and candidate_period_end <= existing_paid_through
        and subscription.current_period_start
    ):
        period_start = subscription.current_period_start

    try:
        amount = Decimal(str(amount_kobo)) / Decimal("100")
    except (InvalidOperation, TypeError, ValueError):
        amount = Decimal("0")

    with transaction.atomic():
        subscription = (
            Subscription.objects.select_for_update()
            .select_related("shop", "plan")
            .get(pk=subscription.pk)
        )
        locked_paid_through = _paid_through(subscription)
        if locked_paid_through and locked_paid_through > period_end:
            period_end = locked_paid_through
            if subscription.current_period_start:
                period_start = subscription.current_period_start
        if plan and subscription.plan_id != plan.id:
            subscription.plan = plan
        if customer_code:
            subscription.paystack_customer_code = customer_code
        subscription.paystack_subscription_code = subscription_code or ""
        subscription.paystack_email_token = email_token or ""
        subscription.status = Subscription.Status.ACTIVE
        subscription.current_period_start = period_start
        subscription.current_period_end = period_end
        if is_pending_checkout_charge:
            subscription.pending_plan = None
            subscription.pending_checkout_reference = ""
            subscription.pending_checkout_token = ""
            subscription.pending_checkout_started_at = None
        subscription.save()

        if period_end and (
            not subscription.shop.subscription_expires_at
            or period_end > subscription.shop.subscription_expires_at
        ):
            subscription.shop.subscription_expires_at = period_end
            subscription.shop.save(update_fields=["subscription_expires_at"])

        if reference:
            PaymentHistory.objects.get_or_create(
                paystack_reference=reference,
                defaults={
                    "shop": subscription.shop,
                    "plan": subscription.plan,
                    "amount": amount,
                    "paid_at": paid_at,
                },
            )

    return "activated"


def on_subscription_create(data):
    result = activate_subscription_from_transaction(data)
    if result == "unresolved":
        raise WebhookProcessingError("Could not resolve subscription.create to a local shop")

    subscription = _resolve_subscription(data, plan=_resolve_plan(data))
    if subscription and subscription.has_pending_checkout:
        subscription.pending_plan = None
        subscription.pending_checkout_reference = ""
        subscription.pending_checkout_token = ""
        subscription.pending_checkout_started_at = None
        subscription.save(
            update_fields=[
                "pending_plan",
                "pending_checkout_reference",
                "pending_checkout_token",
                "pending_checkout_started_at",
                "updated_at",
            ]
        )
    return result


def _mark_subscription_cancelled(data):
    subscription = _resolve_subscription(data, plan=_resolve_plan(data))
    if not subscription:
        return "ignored"
    subscription.status = Subscription.Status.CANCELLED
    subscription.save(update_fields=["status", "updated_at"])
    return "processed"


def on_payment_success(data):
    result = activate_subscription_from_transaction(data)
    if result == "unresolved":
        raise WebhookProcessingError("Could not resolve charge.success to a local subscription")
    logger.info("charge.success result: %s", result)
    return result


def on_subscription_not_renew(data):
    return _mark_subscription_cancelled(data)


def on_subscription_disable(data):
    return _mark_subscription_cancelled(data)


def on_invoice_payment_success(data):
    result = activate_subscription_from_transaction(data)
    if result == "unresolved":
        raise WebhookProcessingError("Could not resolve successful invoice to a local subscription")
    logger.info("Successful invoice result: %s", result)
    return result


def on_invoice_update(data):
    """Handle Paystack's documented subscription renewal invoice event."""
    status_value = str(data.get("status") or "").lower()
    transaction_status = str(_transaction_payload(data).get("status") or "").lower()
    is_paid = data.get("paid") is True or data.get("paid") == 1

    if status_value in {"paid", "success"} or transaction_status == "success" or is_paid:
        return on_invoice_payment_success(data)
    if status_value in {"failed", "attention"}:
        return on_payment_failed(data)

    logger.debug("invoice.update with status=%s, skipping", status_value)
    return "ignored"


def on_payment_failed(data):
    subscription = _resolve_subscription(data, plan=_resolve_plan(data))
    if not subscription:
        raise WebhookProcessingError("Could not resolve invoice.payment_failed")

    paid_through = _paid_through(subscription)
    if paid_through and paid_through > timezone.now():
        logger.info(
            "invoice.payment_failed: keeping subscription %s active until %s",
            subscription.paystack_subscription_code,
            paid_through,
        )
        return "processed"

    subscription.status = Subscription.Status.EXPIRED
    subscription.save(update_fields=["status", "updated_at"])
    logger.info(
        "invoice.payment_failed: marked subscription %s as expired",
        subscription.paystack_subscription_code,
    )
    return "processed"
