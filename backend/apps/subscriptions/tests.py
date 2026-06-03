from datetime import timedelta
from io import StringIO
from unittest.mock import patch

from django.core.management import call_command
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


class SubscriptionWebhookTests(APITestCase):
    def setUp(self):
        self.shop = Shop.objects.create(
            name="Webhook Shop",
            owner_name="Owner",
            email="webhook@example.com",
            phone="08012345678",
        )
        self.plan = Plan.objects.create(
            name="Basic",
            description="Core operations",
            price="3000.00",
            paystack_plan_code="PLN_test_basic",
            interval="monthly",
        )
        # Create an already active subscription with a Paystack subscription code
        self.subscription = Subscription.objects.create(
            shop=self.shop,
            plan=self.plan,
            status=Subscription.Status.ACTIVE,
            paystack_customer_code="CUS_test_customer",
            paystack_subscription_code="SUB_test_code",
            paystack_email_token="EMAIL_token_123",
            current_period_start=timezone.now() - timedelta(days=29),
            current_period_end=timezone.now() + timedelta(days=1),
        )
        self.shop.subscription_expires_at = self.subscription.current_period_end
        self.shop.save()

    @patch("apps.subscriptions.webhook.verify_signature")
    def test_charge_success_auto_renewal_with_inherited_metadata(self, mock_verify):
        mock_verify.return_value = True

        # charge.success auto-renewal event payload:
        # has checkout_token in metadata, but also matches subscription_code
        payload = {
            "event": "charge.success",
            "data": {
                "reference": "ref_renewal_charge_123",
                "amount": 300000,
                "paid_at": timezone.now().isoformat(),
                "metadata": {
                    "shop_id": str(self.shop.id),
                    "plan_id": str(self.plan.id),
                    "checkout_token": "old-checkout-token",
                    "checkout_kind": "subscription_checkout",
                },
                "subscription": {
                    "subscription_code": "SUB_test_code",
                    "next_payment_date": (timezone.now() + timedelta(days=30)).isoformat(),
                },
                "customer": {
                    "customer_code": "CUS_test_customer",
                }
            }
        }

        response = self.client.post(
            "/api/v1/subscriptions/webhook/",
            payload,
            format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        self.subscription.refresh_from_db()
        self.shop.refresh_from_db()

        # The subscription should remain active, and its period should be extended
        self.assertEqual(self.subscription.status, Subscription.Status.ACTIVE)
        self.assertEqual(self.shop.subscription_expires_at, self.subscription.current_period_end)
        self.assertTrue(
            PaymentHistory.objects.filter(
                shop=self.shop,
                paystack_reference="ref_renewal_charge_123"
            ).exists()
        )

    @patch("apps.subscriptions.webhook.verify_signature")
    def test_invoice_payment_success_renewal(self, mock_verify):
        mock_verify.return_value = True

        # invoice.payment_success has subscription_code at top-level
        payload = {
            "event": "invoice.payment_success",
            "data": {
                "subscription_code": "SUB_test_code",
                "amount": 300000,
                "paid_at": timezone.now().isoformat(),
                "next_payment_date": (timezone.now() + timedelta(days=30)).isoformat(),
                "customer": {
                    "customer_code": "CUS_test_customer",
                },
                "transaction": {
                    "reference": "ref_invoice_payment_123"
                }
            }
        }

        response = self.client.post(
            "/api/v1/subscriptions/webhook/",
            payload,
            format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        self.subscription.refresh_from_db()
        self.shop.refresh_from_db()

        self.assertEqual(self.subscription.status, Subscription.Status.ACTIVE)
        self.assertEqual(self.shop.subscription_expires_at, self.subscription.current_period_end)
        self.assertTrue(
            PaymentHistory.objects.filter(
                shop=self.shop,
                paystack_reference="ref_invoice_payment_123"
            ).exists()
        )

    @patch("apps.subscriptions.webhook.verify_signature")
    def test_invoice_update_status_paid(self, mock_verify):
        mock_verify.return_value = True

        payload = {
            "event": "invoice.update",
            "data": {
                "status": "paid",
                "subscription_code": "SUB_test_code",
                "amount": 300000,
                "paid_at": timezone.now().isoformat(),
                "next_payment_date": (timezone.now() + timedelta(days=30)).isoformat(),
                "customer": {
                    "customer_code": "CUS_test_customer",
                },
                "transaction": {
                    "reference": "ref_invoice_update_123"
                }
            }
        }

        response = self.client.post(
            "/api/v1/subscriptions/webhook/",
            payload,
            format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        self.subscription.refresh_from_db()
        self.shop.refresh_from_db()

        self.assertEqual(self.subscription.status, Subscription.Status.ACTIVE)
        self.assertEqual(self.shop.subscription_expires_at, self.subscription.current_period_end)
        self.assertTrue(
            PaymentHistory.objects.filter(
                shop=self.shop,
                paystack_reference="ref_invoice_update_123"
            ).exists()
        )

    def test_webhook_signature_verification(self):
        # Do not patch verify_signature. Send a request with a valid computed signature.
        import json
        import hmac
        import hashlib
        from django.conf import settings
        
        payload = {"event": "charge.success", "data": {}}
        body = json.dumps(payload).encode("utf-8")
        
        key = settings.PAYSTACK_SECRET_KEY.encode("utf-8")
        signature = hmac.new(key, body, hashlib.sha512).hexdigest()
        
        response = self.client.post(
            "/api/v1/subscriptions/webhook/",
            data=body,
            content_type="application/json",
            HTTP_X_PAYSTACK_SIGNATURE=signature
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    @patch("apps.subscriptions.webhook.verify_signature")
    def test_charge_success_auto_renewal_expired_subscription_no_code_in_db(self, mock_verify):
        mock_verify.return_value = True

        # Set local subscription to EXPIRED and clear paystack_subscription_code
        self.subscription.status = Subscription.Status.EXPIRED
        self.subscription.paystack_subscription_code = ""
        self.subscription.save()

        # The incoming recurring charge webhook payload
        payload = {
            "event": "charge.success",
            "data": {
                "reference": "ref_renewal_charge_no_code",
                "amount": 300000,
                "paid_at": timezone.now().isoformat(),
                "metadata": {
                    "shop_id": str(self.shop.id),
                    "plan_id": str(self.plan.id),
                    "checkout_token": "old-checkout-token",
                    "checkout_kind": "subscription_checkout",
                },
                "subscription": {
                    "subscription_code": "SUB_test_code_recovered",
                    "next_payment_date": (timezone.now() + timedelta(days=30)).isoformat(),
                },
                "customer": {
                    "customer_code": "CUS_test_customer",
                }
            }
        }

        response = self.client.post(
            "/api/v1/subscriptions/webhook/",
            payload,
            format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        self.subscription.refresh_from_db()
        self.shop.refresh_from_db()

        # It should activate the subscription and save the subscription_code to DB
        self.assertEqual(self.subscription.status, Subscription.Status.ACTIVE)
        self.assertEqual(self.subscription.paystack_subscription_code, "SUB_test_code_recovered")
        self.assertEqual(self.shop.subscription_expires_at, self.subscription.current_period_end)

    @patch("apps.subscriptions.webhook.verify_signature")
    def test_charge_success_reactivates_expired_subscription_without_subscription_code(self, mock_verify):
        mock_verify.return_value = True
        old_period_end = timezone.now() - timedelta(days=1)
        self.subscription.status = Subscription.Status.EXPIRED
        self.subscription.current_period_end = old_period_end
        self.subscription.save(update_fields=["status", "current_period_end"])
        self.shop.subscription_expires_at = old_period_end
        self.shop.save(update_fields=["subscription_expires_at"])

        payload = {
            "event": "charge.success",
            "data": {
                "reference": "ref_renewal_no_subscription_code",
                "amount": 300000,
                "paid_at": timezone.now().isoformat(),
                "metadata": {
                    "shop_id": str(self.shop.id),
                    "plan_id": str(self.plan.id),
                    "checkout_token": "old-checkout-token",
                    "checkout_kind": "subscription_checkout",
                },
                "customer": {
                    "customer_code": "CUS_test_customer",
                },
            },
        }

        response = self.client.post(
            "/api/v1/subscriptions/webhook/",
            payload,
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.subscription.refresh_from_db()
        self.shop.refresh_from_db()
        self.assertEqual(self.subscription.status, Subscription.Status.ACTIVE)
        self.assertGreater(self.subscription.current_period_end, timezone.now())
        self.assertEqual(self.shop.subscription_expires_at, self.subscription.current_period_end)
        self.assertTrue(
            PaymentHistory.objects.filter(
                shop=self.shop,
                paystack_reference="ref_renewal_no_subscription_code",
            ).exists()
        )

    @patch("apps.subscriptions.webhook.verify_signature")
    def test_invoice_payment_failed_keeps_paid_through_subscription_active(self, mock_verify):
        mock_verify.return_value = True
        future_period_end = timezone.now() + timedelta(days=10)
        self.subscription.status = Subscription.Status.ACTIVE
        self.subscription.current_period_end = future_period_end
        self.subscription.save(update_fields=["status", "current_period_end"])
        self.shop.subscription_expires_at = future_period_end
        self.shop.save(update_fields=["subscription_expires_at"])

        payload = {
            "event": "invoice.payment_failed",
            "data": {
                "subscription_code": "SUB_test_code",
                "customer": {
                    "customer_code": "CUS_test_customer",
                },
            },
        }

        response = self.client.post(
            "/api/v1/subscriptions/webhook/",
            payload,
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.subscription.refresh_from_db()
        self.assertEqual(self.subscription.status, Subscription.Status.ACTIVE)
        self.assertEqual(self.subscription.current_period_end, future_period_end)


class PaystackReconciliationCommandTests(APITestCase):
    def setUp(self):
        self.shop = Shop.objects.create(
            name="Recovery Shop",
            owner_name="Owner",
            email="recovery@example.com",
            phone="08012345678",
        )
        self.plan = Plan.objects.create(
            name="Basic",
            description="Core operations",
            price="3000.00",
            paystack_plan_code="PLN_recovery_basic",
            interval="monthly",
        )
        old_period_end = timezone.now() - timedelta(days=2)
        self.subscription = Subscription.objects.create(
            shop=self.shop,
            plan=self.plan,
            status=Subscription.Status.EXPIRED,
            paystack_customer_code="CUS_recovery_customer",
            current_period_start=old_period_end - timedelta(days=30),
            current_period_end=old_period_end,
        )
        self.shop.subscription_expires_at = old_period_end
        self.shop.save(update_fields=["subscription_expires_at"])

    @patch("apps.subscriptions.management.commands.reconcile_paystack_subscriptions.paystack.find_subscription")
    def test_reconcile_paystack_subscriptions_unlocks_active_remote_subscription(self, mock_find_subscription):
        next_payment_date = timezone.now() + timedelta(days=28)
        mock_find_subscription.return_value = {
            "subscription_code": "SUB_recovered",
            "email_token": "EMAIL_recovered",
            "status": "active",
            "raw": {
                "createdAt": timezone.now().isoformat(),
                "next_payment_date": next_payment_date.isoformat(),
            },
        }
        stdout = StringIO()

        call_command(
            "reconcile_paystack_subscriptions",
            shop_id=self.shop.id,
            stdout=stdout,
        )

        self.subscription.refresh_from_db()
        self.shop.refresh_from_db()
        self.assertEqual(self.subscription.status, Subscription.Status.ACTIVE)
        self.assertEqual(self.subscription.paystack_subscription_code, "SUB_recovered")
        self.assertEqual(self.subscription.paystack_email_token, "EMAIL_recovered")
        self.assertEqual(self.subscription.current_period_end, next_payment_date)
        self.assertEqual(self.shop.subscription_expires_at, next_payment_date)
        self.assertIn("reconciled 1", stdout.getvalue())


