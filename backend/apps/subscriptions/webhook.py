"""
Paystack sends POST events to /api/v1/subscriptions/webhook/
This module handles each event type and updates the database accordingly.
"""
import calendar
import hashlib
import hmac
from django.conf import settings
from django.utils import timezone
from datetime import datetime

from apps.shops.models import Shop
from .models import Subscription, PaymentHistory, Plan
from . import paystack


def verify_signature(request):
    """
    Validates that the webhook truly came from Paystack.
    Paystack signs every webhook with your secret key.
    """
    paystack_signature = request.headers.get("x-paystack-signature", "")
    computed = hmac.new(
        settings.PAYSTACK_SECRET_KEY.encode("utf-8"),
        request.body,
        hashlib.sha512,
    ).hexdigest()
    return hmac.compare_digest(paystack_signature, computed)


def handle_event(event_type, data):
    """Routes incoming webhook events to the right handler."""
    handlers = {
        "subscription.create": on_subscription_create,
        "subscription.disable": on_subscription_disable,
        "charge.success": on_payment_success,
        "invoice.payment_success": on_payment_success,
        "invoice.payment_failed": on_payment_failed,
    }
    handler = handlers.get(event_type)
    if handler:
        handler(data)


def _parse_datetime(value):
    if not value:
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


def _resolve_plan(data):
    metadata = data.get("metadata") or {}
    plan_id = metadata.get("plan_id")
    if plan_id:
        try:
            return Plan.objects.get(id=int(plan_id))
        except (Plan.DoesNotExist, TypeError, ValueError):
            pass

    plan_code = (data.get("plan_object") or {}).get("plan_code")
    if plan_code:
        try:
            return Plan.objects.get(paystack_plan_code=plan_code)
        except Plan.DoesNotExist:
            pass

    return None


def _resolve_subscription(data, plan=None):
    metadata = data.get("metadata") or {}
    shop_id = metadata.get("shop_id")
    if shop_id:
        try:
            return Subscription.objects.select_related("shop", "plan").get(shop_id=int(shop_id))
        except (Subscription.DoesNotExist, TypeError, ValueError):
            pass

    customer_code = (data.get("customer") or {}).get("customer_code")
    if customer_code:
        try:
            return Subscription.objects.select_related("shop", "plan").get(
                paystack_customer_code=customer_code
            )
        except Subscription.DoesNotExist:
            pass

    if plan:
        customer_email = (data.get("customer") or {}).get("email")
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
    metadata = data.get("metadata") or {}
    reference = data.get("reference") or data.get("transaction", {}).get("reference", "")
    amount_kobo = data.get("amount", 0) or 0
    paid_at = _parse_datetime(data.get("paid_at")) or timezone.now()
    plan = _resolve_plan(data)
    subscription = _resolve_subscription(data, plan=plan)
    if not subscription:
        return "ignored"

    subscription_code = (
        data.get("subscription_code")
        or data.get("subscription", {}).get("subscription_code")
        or subscription.paystack_subscription_code
    )
    email_token = (
        data.get("email_token")
        or data.get("subscription", {}).get("email_token")
        or subscription.paystack_email_token
    )
    checkout_token = metadata.get("checkout_token", "")
    is_known_recurring_charge = bool(
        subscription_code
        and subscription.paystack_subscription_code
        and subscription_code == subscription.paystack_subscription_code
    )
    is_pending_checkout_charge = False
    if subscription.has_pending_checkout and not is_known_recurring_charge:
        if checkout_token:
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
        return "ignored"

    if plan and subscription.plan_id != plan.id:
        subscription.plan = plan

    customer_code = (data.get("customer") or {}).get("customer_code", "")
    if customer_code and subscription.paystack_customer_code != customer_code:
        subscription.paystack_customer_code = customer_code

    if (not subscription_code or not email_token) and customer_code and plan and plan.paystack_plan_code:
        try:
            remote_subscription = paystack.find_subscription(
                customer_code=customer_code,
                plan_code=plan.paystack_plan_code,
                statuses=["active", "non-renewing", "attention"],
            )
        except Exception:
            remote_subscription = None
        if remote_subscription:
            subscription_code = subscription_code or remote_subscription.get("subscription_code", "")
            email_token = email_token or remote_subscription.get("email_token", "")

    period_start = (
        _parse_datetime(data.get("createdAt"))
        or _parse_datetime(data.get("paid_at"))
        or timezone.now()
    )
    period_end = (
        _parse_datetime(data.get("next_payment_date"))
        or _parse_datetime(data.get("subscription", {}).get("next_payment_date"))
        or _calculate_period_end(period_start, (subscription.plan.interval if subscription.plan else "monthly"))
    )

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

    if period_end:
        subscription.shop.subscription_expires_at = period_end
        subscription.shop.save(update_fields=["subscription_expires_at"])

    if reference:
        PaymentHistory.objects.get_or_create(
            paystack_reference=reference,
            defaults={
                "shop": subscription.shop,
                "plan": subscription.plan,
                "amount": amount_kobo / 100,
                "paid_at": paid_at,
            },
        )

    return "activated"


def on_subscription_create(data):
    customer_code = data.get("customer", {}).get("customer_code")
    subscription_code = data.get("subscription_code")
    email_token = data.get("email_token", "")
    period_start = _parse_datetime(data.get("createdAt"))
    period_end = _parse_datetime(data.get("next_payment_date"))

    try:
        subscription = Subscription.objects.get(paystack_customer_code=customer_code)
        subscription.paystack_subscription_code = subscription_code
        subscription.paystack_email_token = email_token
        subscription.status = Subscription.Status.ACTIVE
        subscription.current_period_start = period_start
        subscription.current_period_end = period_end
        subscription.pending_plan = None
        subscription.pending_checkout_reference = ""
        subscription.pending_checkout_token = ""
        subscription.pending_checkout_started_at = None
        subscription.save()

        # Extend the shop's access
        if period_end:
            subscription.shop.subscription_expires_at = period_end
            subscription.shop.save()

    except Subscription.DoesNotExist:
        pass


def on_subscription_disable(data):
    subscription_code = data.get("subscription_code")
    try:
        subscription = Subscription.objects.get(
            paystack_subscription_code=subscription_code
        )
        subscription.status = Subscription.Status.CANCELLED
        subscription.save()
    except Subscription.DoesNotExist:
        pass


def on_payment_success(data):
    activate_subscription_from_transaction(data)


def on_payment_failed(data):
    subscription_code = data.get("subscription", {}).get("subscription_code")
    try:
        subscription = Subscription.objects.get(
            paystack_subscription_code=subscription_code
        )
        subscription.status = Subscription.Status.EXPIRED
        subscription.save()
    except Subscription.DoesNotExist:
        pass
