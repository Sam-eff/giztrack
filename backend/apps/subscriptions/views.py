import json
import secrets
from django.views.decorators.csrf import csrf_exempt
from django.utils.decorators import method_decorator
from django.utils import timezone
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework import status
from django.shortcuts import redirect as django_redirect
from django.conf import settings
from utils.permissions import IsAdmin
from .models import Plan, Subscription, PaymentHistory
from .serializers import (
    PlanSerializer,
    SubscriptionSerializer,
    InitializePaymentSerializer,
    PaymentHistorySerializer,
)
from . import paystack, webhook


class PlanListView(APIView):
    """GET /subscriptions/plans/ — public, no auth needed."""
    permission_classes = [AllowAny]

    def get(self, request):
        plans = Plan.objects.filter(is_active=True)
        return Response(PlanSerializer(plans, many=True).data)


class CurrentSubscriptionView(APIView):
    """GET /subscriptions/current/ — returns this shop's subscription."""
    permission_classes = [IsAuthenticated, IsAdmin]

    def get(self, request):
        try:
            sub = request.user.shop.subscription
            if (
                sub.status == Subscription.Status.ACTIVE
                and sub.has_pending_checkout
                and (
                    sub.pending_plan_id == sub.plan_id
                    or PaymentHistory.objects.filter(
                        shop=request.user.shop,
                        paystack_reference=sub.pending_checkout_reference,
                    ).exists()
                )
            ):
                sub.pending_plan = None
                sub.pending_checkout_reference = ""
                sub.pending_checkout_token = ""
                sub.pending_checkout_started_at = None
                sub.save(
                    update_fields=[
                        "pending_plan",
                        "pending_checkout_reference",
                        "pending_checkout_token",
                        "pending_checkout_started_at",
                    ]
                )
            return Response(SubscriptionSerializer(sub).data)
        except Subscription.DoesNotExist:
            return Response({"status": "no_subscription", "message": "No active subscription."})


class InitializePaymentView(APIView):
    """
    POST /subscriptions/initialize/
    Initializes a Paystack transaction for the given plan and returns
    the authorization_url to redirect the user to Paystack checkout.
    """
    permission_classes = [IsAuthenticated, IsAdmin]

    def post(self, request):
        serializer = InitializePaymentSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        plan_id = serializer.validated_data["plan_id"]
        try:
            plan = Plan.objects.get(id=plan_id, is_active=True)
        except Plan.DoesNotExist:
            return Response({"error": "Plan not found."}, status=404)

        shop = request.user.shop
        callback_url = f"{settings.BACKEND_URL}/api/v1/subscriptions/callback/"

        # Ensure a Subscription record exists and store Paystack customer code.
        # Do not switch the active plan here; only finalize the plan after Paystack
        # confirms the transaction, otherwise a canceled checkout can still look upgraded.
        subscription, _ = Subscription.objects.get_or_create(
            shop=shop,
            defaults={"status": Subscription.Status.PENDING},
        )

        if subscription.has_pending_checkout:
            pending_name = subscription.pending_plan.name if subscription.pending_plan else "selected"
            return Response(
                {
                    "detail": (
                        f"You already have a pending checkout for {pending_name}. "
                        "Complete it or cancel the pending checkout first."
                    )
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        if shop.subscription_is_active and subscription.status in {
            Subscription.Status.ACTIVE,
            Subscription.Status.CANCELLED,
        }:
            plan_name = subscription.plan.name if subscription.plan else "current"
            if subscription.current_period_end:
                end_date = timezone.localtime(subscription.current_period_end).date().isoformat()
                if subscription.status == Subscription.Status.CANCELLED:
                    detail = (
                        f"Your {plan_name} subscription remains active until {end_date}. "
                        "You can choose a new plan after that date."
                    )
                else:
                    detail = (
                        f"Your {plan_name} subscription is active until {end_date}. "
                        "Cancel it first to stop future renewals, then choose a new plan "
                        "after the current billing period ends."
                    )
            else:
                detail = (
                    f"Your {plan_name} subscription is still active. "
                    "Cancel it first before starting another plan checkout."
                )
            return Response({"detail": detail}, status=status.HTTP_400_BAD_REQUEST)

        # Create or retrieve Paystack customer
        if not subscription.paystack_customer_code:
            try:
                customer_code = paystack.create_customer(
                    email=request.user.email,
                    full_name=request.user.get_full_name(),
                    phone=shop.phone,
                )
                subscription.paystack_customer_code = customer_code
                subscription.save(update_fields=["paystack_customer_code"])
            except Exception as e:
                return Response(
                    {"error": "Failed to create Paystack customer.", "detail": str(e)},
                    status=status.HTTP_502_BAD_GATEWAY,
                )

        # Initialize the transaction
        checkout_token = secrets.token_urlsafe(24)
        try:
            result = paystack.initialize_transaction(
                email=request.user.email,
                amount_kobo=int(float(plan.price) * 100),
                plan_code=plan.paystack_plan_code,
                callback_url=callback_url,
                metadata={
                    "shop_id": shop.id,
                    "plan_id": plan.id,
                    "user_id": request.user.id,
                    "checkout_token": checkout_token,
                    "checkout_kind": "subscription_checkout",
                },
            )
        except Exception as e:
            return Response(
                {"error": "Failed to initialize payment.", "detail": str(e)},
                status=status.HTTP_502_BAD_GATEWAY,
            )

        subscription.pending_plan = plan
        subscription.pending_checkout_reference = result["reference"]
        subscription.pending_checkout_token = checkout_token
        subscription.pending_checkout_started_at = timezone.now()
        subscription.save(
            update_fields=[
                "pending_plan",
                "pending_checkout_reference",
                "pending_checkout_token",
                "pending_checkout_started_at",
            ]
        )

        return Response({
            "authorization_url": result["authorization_url"],
            "reference": result["reference"],
        })


class CancelPendingCheckoutView(APIView):
    """POST /subscriptions/cancel-checkout/ — abandons an uncompleted checkout attempt."""
    permission_classes = [IsAuthenticated, IsAdmin]

    def post(self, request):
        try:
            sub = request.user.shop.subscription
        except Subscription.DoesNotExist:
            return Response({"error": "No subscription record found."}, status=status.HTTP_404_NOT_FOUND)

        if not sub.has_pending_checkout:
            return Response({"error": "No pending checkout to cancel."}, status=status.HTTP_400_BAD_REQUEST)

        sub.pending_plan = None
        sub.pending_checkout_reference = ""
        sub.pending_checkout_token = ""
        sub.pending_checkout_started_at = None
        sub.save(
            update_fields=[
                "pending_plan",
                "pending_checkout_reference",
                "pending_checkout_token",
                "pending_checkout_started_at",
            ]
        )

        return Response({"message": "Pending checkout cancelled."}, status=status.HTTP_200_OK)


class CancelSubscriptionView(APIView):
    """POST /subscriptions/cancel/ — stops future recurring renewals of the active subscription."""
    permission_classes = [IsAuthenticated, IsAdmin]

    def post(self, request):
        try:
            sub = request.user.shop.subscription
        except Subscription.DoesNotExist:
            return Response({"error": "No subscription found."}, status=status.HTTP_404_NOT_FOUND)

        if sub.status != Subscription.Status.ACTIVE:
            return Response({"error": "No active subscription to cancel."}, status=status.HTTP_400_BAD_REQUEST)

        if not sub.paystack_subscription_code or not sub.paystack_email_token:
            remote_subscription = None
            if sub.paystack_customer_code:
                try:
                    remote_subscription = paystack.find_subscription(
                        customer_code=sub.paystack_customer_code,
                        plan_code=sub.plan.paystack_plan_code if sub.plan else None,
                        statuses=["active", "non-renewing", "attention"],
                    )
                except Exception as e:
                    return Response(
                        {
                            "error": "Could not confirm recurring billing details with Paystack.",
                            "detail": str(e),
                        },
                        status=status.HTTP_502_BAD_GATEWAY,
                    )

            if remote_subscription:
                sub.paystack_subscription_code = remote_subscription["subscription_code"]
                sub.paystack_email_token = remote_subscription["email_token"]
                if sub.paystack_subscription_code and sub.paystack_email_token:
                    sub.save(update_fields=["paystack_subscription_code", "paystack_email_token"])
                else:
                    sub.status = Subscription.Status.CANCELLED
                    sub.save(update_fields=["status"])
                    return Response(
                        {
                            "message": (
                                "Recurring billing identifiers were incomplete, so local renewal access "
                                "has been cancelled. Your current access will remain until the end of "
                                "the billing period."
                            )
                        }
                    )
            else:
                sub.status = Subscription.Status.CANCELLED
                sub.save(update_fields=["status"])
                return Response(
                    {
                        "message": (
                            "No recurring Paystack subscription was linked to this plan, "
                            "so local renewal access has been cancelled. Your current access "
                            "will remain until the end of the billing period."
                        )
                    }
                )

        try:
            paystack.cancel_subscription(
                subscription_code=sub.paystack_subscription_code,
                email_token=sub.paystack_email_token,
            )
            sub.status = Subscription.Status.CANCELLED
            sub.save()
            return Response({"message": "Subscription cancelled successfully."})
        except Exception as e:
            return Response(
                {"error": "Cancellation failed.", "detail": str(e)},
                status=status.HTTP_502_BAD_GATEWAY,
            )


class PaymentHistoryView(APIView):
    """GET /subscriptions/payments/ — billing history for this shop."""
    permission_classes = [IsAuthenticated, IsAdmin]

    def get(self, request):
        payments = PaymentHistory.objects.filter(shop=request.user.shop)
        return Response(PaymentHistorySerializer(payments, many=True).data)


@method_decorator(csrf_exempt, name="dispatch")
class PaystackWebhookView(APIView):
    """
    POST /subscriptions/webhook/
    Receives and processes Paystack webhook events.
    CSRF exempt — Paystack cannot send a CSRF token.
    Authentication is done via HMAC signature verification instead.
    """
    permission_classes = [AllowAny]

    def post(self, request):
        if not webhook.verify_signature(request):
            return Response({"error": "Invalid signature."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            payload = json.loads(request.body)
            event_type = payload.get("event")
            data = payload.get("data", {})
            webhook.handle_event(event_type, data)
        except Exception:
            # Always return 200 to Paystack even on internal errors
            # so it doesn't keep retrying
            pass

        return Response({"status": "ok"})


class PaystackCallbackView(APIView):
    """
    GET /subscriptions/callback/?reference=...
    Paystack redirects the browser here after a payment attempt.

    Security note: this callback verifies the transaction directly with Paystack
    and finalizes the local subscription as a safe fallback for environments
    where the webhook is delayed or cannot reach the backend, such as local dev.
    The webhook remains idempotent and can still enrich recurring fields later.
    """
    permission_classes = [AllowAny]

    def get(self, request):
        reference = request.GET.get("reference")
        if not reference:
            return django_redirect(f"{settings.FRONTEND_URL}/billing?status=failed")

        try:
            result = paystack.verify_transaction(reference)
            if result.get("status") == "success":
                activation_status = webhook.activate_subscription_from_transaction(result)
                if activation_status == "activated":
                    return django_redirect(
                        f"{settings.FRONTEND_URL}/billing?status=success&ref={reference}"
                    )
                return django_redirect(
                    f"{settings.FRONTEND_URL}/billing?status=cancelled&ref={reference}"
                )
            else:
                return django_redirect(f"{settings.FRONTEND_URL}/billing?status=failed")
        except Exception as e:
            return django_redirect(f"{settings.FRONTEND_URL}/billing?status=failed")
