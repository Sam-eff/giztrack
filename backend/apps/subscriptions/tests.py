from datetime import timedelta
from unittest.mock import patch

from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from apps.accounts.models import CustomUser, Role
from apps.shops.models import Shop
from .models import PaymentHistory, Plan, Subscription


class SubscriptionCallbackTests(APITestCase):
    def setUp(self):
        self.shop = Shop.objects.create(
            name="Billing Shop",
            owner_name="Owner",
            email="billing@example.com",
            phone="08012345678",
        )
        self.user = CustomUser.objects.create_user(
            email="billing-admin@example.com",
            password="StrongPass123!",
            first_name="Billing",
            last_name="Admin",
            shop=self.shop,
            role=Role.ADMIN,
        )
        self.plan = Plan.objects.create(
            name="Basic",
            description="Core operations",
            price="3000.00",
            paystack_plan_code="PLN_test_basic",
            interval="monthly",
        )
        self.subscription = Subscription.objects.create(
            shop=self.shop,
            plan=self.plan,
            status=Subscription.Status.PENDING,
            paystack_customer_code="CUS_test_customer",
        )

    @patch("apps.subscriptions.views.paystack.verify_transaction")
    def test_callback_finalizes_subscription_when_payment_verifies(self, mock_verify):
        paid_at = timezone.now()
        mock_verify.return_value = {
            "status": "success",
            "reference": "ref_123",
            "amount": 300000,
            "paid_at": paid_at.isoformat(),
            "customer": {
                "customer_code": "CUS_test_customer",
                "email": self.shop.email,
            },
            "metadata": {
                "shop_id": str(self.shop.id),
                "plan_id": str(self.plan.id),
                "user_id": str(self.user.id),
            },
            "plan_object": {
                "plan_code": self.plan.paystack_plan_code,
                "interval": self.plan.interval,
            },
        }

        response = self.client.get("/api/v1/subscriptions/callback/?reference=ref_123")

        self.assertEqual(response.status_code, 302)
        self.assertIn("status=success", response["Location"])

        self.subscription.refresh_from_db()
        self.shop.refresh_from_db()

        self.assertEqual(self.subscription.status, Subscription.Status.ACTIVE)
        self.assertIsNotNone(self.subscription.current_period_start)
        self.assertIsNotNone(self.subscription.current_period_end)
        self.assertEqual(self.shop.subscription_expires_at, self.subscription.current_period_end)
        self.assertTrue(
            PaymentHistory.objects.filter(
                shop=self.shop,
                paystack_reference="ref_123",
            ).exists()
        )

    @patch("apps.subscriptions.views.paystack.initialize_transaction")
    def test_initialize_keeps_active_plan_until_payment_succeeds(self, mock_initialize):
        pro_plan = Plan.objects.create(
            name="Pro",
            description="Advanced operations",
            price="7000.00",
            paystack_plan_code="PLN_test_pro",
            interval="monthly",
        )
        mock_initialize.return_value = {
            "authorization_url": "https://paystack.test/authorize/pro",
            "access_code": "access_pro",
            "reference": "ref_pro_pending",
        }

        self.client.force_authenticate(user=self.user)
        response = self.client.post(
            "/api/v1/subscriptions/initialize/",
            {"plan_id": pro_plan.id},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.subscription.refresh_from_db()
        self.assertEqual(self.subscription.plan_id, self.plan.id)
        self.assertEqual(self.subscription.pending_plan_id, pro_plan.id)
        self.assertEqual(self.subscription.pending_checkout_reference, "ref_pro_pending")
        self.assertTrue(self.subscription.pending_checkout_token)

    @patch("apps.subscriptions.views.paystack.verify_transaction")
    @patch("apps.subscriptions.views.paystack.initialize_transaction")
    def test_callback_clears_pending_checkout_when_verified_by_reference(
        self,
        mock_initialize,
        mock_verify,
    ):
        pro_plan = Plan.objects.create(
            name="Pro",
            description="Advanced operations",
            price="7000.00",
            paystack_plan_code="PLN_test_pro_success",
            interval="monthly",
        )
        mock_initialize.return_value = {
            "authorization_url": "https://paystack.test/authorize/pro",
            "access_code": "access_pro",
            "reference": "ref_pro_success",
        }

        self.client.force_authenticate(user=self.user)
        start_response = self.client.post(
            "/api/v1/subscriptions/initialize/",
            {"plan_id": pro_plan.id},
            format="json",
        )
        self.assertEqual(start_response.status_code, status.HTTP_200_OK)
        self.subscription.refresh_from_db()
        self.assertTrue(self.subscription.has_pending_checkout)

        paid_at = timezone.now()
        mock_verify.return_value = {
            "status": "success",
            "reference": "ref_pro_success",
            "amount": 700000,
            "paid_at": paid_at.isoformat(),
            "customer": {
                "customer_code": "CUS_test_customer",
                "email": self.shop.email,
            },
            "metadata": {
                "shop_id": str(self.shop.id),
                "plan_id": str(pro_plan.id),
                "user_id": str(self.user.id),
                "checkout_kind": "subscription_checkout",
            },
            "plan_object": {
                "plan_code": pro_plan.paystack_plan_code,
                "interval": pro_plan.interval,
            },
        }

        callback_response = self.client.get("/api/v1/subscriptions/callback/?reference=ref_pro_success")

        self.assertEqual(callback_response.status_code, 302)
        self.assertIn("status=success", callback_response["Location"])

        self.subscription.refresh_from_db()
        self.assertEqual(self.subscription.plan_id, pro_plan.id)
        self.assertEqual(self.subscription.status, Subscription.Status.ACTIVE)
        self.assertFalse(self.subscription.has_pending_checkout)
        self.assertIsNone(self.subscription.pending_plan)
        self.assertEqual(self.subscription.pending_checkout_reference, "")
        self.assertEqual(self.subscription.pending_checkout_token, "")
        self.assertIsNone(self.subscription.pending_checkout_started_at)
        self.assertTrue(
            PaymentHistory.objects.filter(
                shop=self.shop,
                paystack_reference="ref_pro_success",
            ).exists()
        )

    def test_current_subscription_clears_stale_pending_checkout_after_activation(self):
        now = timezone.now()
        self.subscription.status = Subscription.Status.ACTIVE
        self.subscription.current_period_start = now
        self.subscription.current_period_end = now + timedelta(days=30)
        self.subscription.pending_plan = self.plan
        self.subscription.pending_checkout_reference = "ref_already_paid"
        self.subscription.pending_checkout_token = "stale-token"
        self.subscription.pending_checkout_started_at = now
        self.subscription.save()
        self.shop.subscription_expires_at = self.subscription.current_period_end
        self.shop.save(update_fields=["subscription_expires_at"])

        self.client.force_authenticate(user=self.user)
        response = self.client.get("/api/v1/subscriptions/current/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertFalse(response.data["has_pending_checkout"])
        self.subscription.refresh_from_db()
        self.assertFalse(self.subscription.has_pending_checkout)
        self.assertIsNone(self.subscription.pending_plan)
        self.assertEqual(self.subscription.pending_checkout_reference, "")
        self.assertEqual(self.subscription.pending_checkout_token, "")
        self.assertIsNone(self.subscription.pending_checkout_started_at)

    @patch("apps.subscriptions.views.paystack.initialize_transaction")
    def test_active_subscription_blocks_new_plan_checkout(self, mock_initialize):
        pro_plan = Plan.objects.create(
            name="Pro",
            description="Advanced operations",
            price="7000.00",
            paystack_plan_code="PLN_test_pro_blocked",
            interval="monthly",
        )
        now = timezone.now()
        self.subscription.status = Subscription.Status.ACTIVE
        self.subscription.current_period_start = now
        self.subscription.current_period_end = now + timedelta(days=30)
        self.subscription.save()
        self.shop.subscription_expires_at = self.subscription.current_period_end
        self.shop.save(update_fields=["subscription_expires_at"])

        self.client.force_authenticate(user=self.user)
        response = self.client.post(
            "/api/v1/subscriptions/initialize/",
            {"plan_id": pro_plan.id},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("detail", response.data)
        self.subscription.refresh_from_db()
        self.assertEqual(self.subscription.plan_id, self.plan.id)
        self.assertFalse(self.subscription.has_pending_checkout)
        mock_initialize.assert_not_called()

    @patch("apps.subscriptions.views.paystack.initialize_transaction")
    def test_cancel_pending_checkout_prevents_old_callback_from_activating(self, mock_initialize):
        pro_plan = Plan.objects.create(
            name="Pro",
            description="Advanced operations",
            price="7000.00",
            paystack_plan_code="PLN_test_pro_cancel",
            interval="monthly",
        )

        mock_initialize.return_value = {
            "authorization_url": "https://paystack.test/authorize/pro",
            "access_code": "access_pro",
            "reference": "ref_pro_cancelled",
        }

        self.client.force_authenticate(user=self.user)
        start_response = self.client.post(
            "/api/v1/subscriptions/initialize/",
            {"plan_id": pro_plan.id},
            format="json",
        )
        self.assertEqual(start_response.status_code, status.HTTP_200_OK)

        self.subscription.refresh_from_db()
        old_token = self.subscription.pending_checkout_token

        cancel_response = self.client.post("/api/v1/subscriptions/cancel-checkout/")
        self.assertEqual(cancel_response.status_code, status.HTTP_200_OK)

        with patch("apps.subscriptions.views.paystack.verify_transaction") as mock_verify:
            paid_at = timezone.now()
            mock_verify.return_value = {
                "status": "success",
                "reference": "ref_pro_cancelled",
                "amount": 700000,
                "paid_at": paid_at.isoformat(),
                "customer": {
                    "customer_code": "CUS_test_customer",
                    "email": self.shop.email,
                },
                "metadata": {
                    "shop_id": str(self.shop.id),
                    "plan_id": str(pro_plan.id),
                    "user_id": str(self.user.id),
                    "checkout_token": old_token,
                    "checkout_kind": "subscription_checkout",
                },
                "plan_object": {
                    "plan_code": pro_plan.paystack_plan_code,
                    "interval": pro_plan.interval,
                },
            }

            callback_response = self.client.get("/api/v1/subscriptions/callback/?reference=ref_pro_cancelled")

        self.assertEqual(callback_response.status_code, 302)
        self.assertIn("status=cancelled", callback_response["Location"])

        self.subscription.refresh_from_db()
        self.assertEqual(self.subscription.plan_id, self.plan.id)
        self.assertEqual(self.subscription.status, Subscription.Status.PENDING)
        self.assertFalse(self.subscription.has_pending_checkout)
        self.assertFalse(
            PaymentHistory.objects.filter(
                shop=self.shop,
                paystack_reference="ref_pro_cancelled",
            ).exists()
        )

    @patch("apps.subscriptions.views.paystack.cancel_subscription")
    @patch("apps.subscriptions.views.paystack.find_subscription")
    def test_cancel_subscription_recovers_missing_paystack_codes(self, mock_find_subscription, mock_cancel):
        now = timezone.now()
        self.subscription.status = Subscription.Status.ACTIVE
        self.subscription.current_period_start = now
        self.subscription.current_period_end = now + timedelta(days=30)
        self.subscription.paystack_customer_code = "CUS_test_customer"
        self.subscription.paystack_subscription_code = ""
        self.subscription.paystack_email_token = ""
        self.subscription.save()
        self.shop.subscription_expires_at = self.subscription.current_period_end
        self.shop.save(update_fields=["subscription_expires_at"])

        mock_find_subscription.return_value = {
            "subscription_code": "SUB_live_123",
            "email_token": "EMAIL_token_123",
            "status": "active",
        }

        self.client.force_authenticate(user=self.user)
        response = self.client.post("/api/v1/subscriptions/cancel/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.subscription.refresh_from_db()
        self.assertEqual(self.subscription.paystack_subscription_code, "SUB_live_123")
        self.assertEqual(self.subscription.paystack_email_token, "EMAIL_token_123")
        self.assertEqual(self.subscription.status, Subscription.Status.CANCELLED)
        mock_cancel.assert_called_once_with(
            subscription_code="SUB_live_123",
            email_token="EMAIL_token_123",
        )

    @patch("apps.subscriptions.views.paystack.find_subscription")
    def test_cancel_subscription_without_remote_recurring_record_cancels_locally(self, mock_find_subscription):
        now = timezone.now()
        self.subscription.status = Subscription.Status.ACTIVE
        self.subscription.current_period_start = now
        self.subscription.current_period_end = now + timedelta(days=30)
        self.subscription.paystack_customer_code = "CUS_test_customer"
        self.subscription.paystack_subscription_code = ""
        self.subscription.paystack_email_token = ""
        self.subscription.save()
        self.shop.subscription_expires_at = self.subscription.current_period_end
        self.shop.save(update_fields=["subscription_expires_at"])

        mock_find_subscription.return_value = None

        self.client.force_authenticate(user=self.user)
        response = self.client.post("/api/v1/subscriptions/cancel/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.subscription.refresh_from_db()
        self.assertEqual(self.subscription.status, Subscription.Status.CANCELLED)
        self.assertIn("message", response.data)
