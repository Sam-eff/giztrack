from datetime import timedelta
from unittest.mock import patch

from django.conf import settings
from django.test import override_settings
from django.utils import timezone
from django.contrib.auth.tokens import default_token_generator
from django.utils.http import urlsafe_base64_encode
from django.utils.encoding import force_bytes
from rest_framework import status
from rest_framework.test import APIClient, APITestCase

from apps.accounts.models import CustomUser, Role
from apps.shops.models import Shop
from apps.subscriptions.models import Plan, Subscription


class AuthSecurityTests(APITestCase):
    def setUp(self):
        self.shop = Shop.objects.create(
            name="Main Shop",
            owner_name="Owner",
            email="owner@example.com",
            phone="08012345678",
        )
        self.user = CustomUser.objects.create_user(
            email="admin@example.com",
            password="StrongPass123!",
            first_name="Admin",
            last_name="User",
            shop=self.shop,
            role=Role.ADMIN,
        )

    def test_login_sets_http_only_cookies_and_me_uses_cookie_auth(self):
        csrf_client = APIClient(enforce_csrf_checks=True)
        csrf_cookie_response = csrf_client.get("/api/v1/auth/csrf/")
        self.assertEqual(csrf_cookie_response.status_code, status.HTTP_200_OK)
        csrf_token = csrf_client.cookies.get("csrftoken")
        self.assertIsNotNone(csrf_token)

        response = csrf_client.post(
            "/api/v1/auth/login/",
            {"email": self.user.email, "password": "StrongPass123!"},
            format="json",
            HTTP_X_CSRFTOKEN=csrf_token.value,
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertNotIn("access", response.data)
        self.assertNotIn("refresh", response.data)
        self.assertIn(settings.AUTH_COOKIE_ACCESS, response.cookies)
        self.assertIn(settings.AUTH_COOKIE_REFRESH, response.cookies)
        self.assertTrue(response.cookies[settings.AUTH_COOKIE_ACCESS]["httponly"])
        self.assertTrue(response.cookies[settings.AUTH_COOKIE_REFRESH]["httponly"])

        me_response = csrf_client.get("/api/v1/auth/me/")
        self.assertEqual(me_response.status_code, status.HTTP_200_OK)
        self.assertEqual(me_response.data["email"], self.user.email)

    def test_login_requires_csrf_when_using_cookie_auth_flow(self):
        csrf_client = APIClient(enforce_csrf_checks=True)

        response = csrf_client.post(
            "/api/v1/auth/login/",
            {"email": self.user.email, "password": "StrongPass123!"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertIn("detail", response.data)

    @patch("apps.accounts.views.send_giztrack_email", side_effect=Exception("smtp down"))
    def test_forgot_password_returns_200_even_if_email_send_fails(self, _mock_send_mail):
        csrf_client = APIClient(enforce_csrf_checks=True)
        csrf_client.get("/api/v1/auth/csrf/")
        csrf_token = csrf_client.cookies.get("csrftoken")

        response = csrf_client.post(
            "/api/v1/auth/forgot-password/",
            {"email": self.user.email},
            format="json",
            HTTP_X_CSRFTOKEN=csrf_token.value,
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("message", response.data)

    @override_settings(FRONTEND_URL="https://app.giztrack.test/")
    @patch("apps.accounts.views.send_giztrack_email")
    def test_forgot_password_sends_reset_email_for_registered_user(self, mock_send_mail):
        csrf_client = APIClient(enforce_csrf_checks=True)
        csrf_client.get("/api/v1/auth/csrf/")
        csrf_token = csrf_client.cookies.get("csrftoken")

        response = csrf_client.post(
            "/api/v1/auth/forgot-password/",
            {"email": self.user.email},
            format="json",
            HTTP_X_CSRFTOKEN=csrf_token.value,
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        mock_send_mail.assert_called_once()

        _, kwargs = mock_send_mail.call_args
        self.assertEqual(kwargs["recipient_list"], [self.user.email])
        self.assertFalse(kwargs["fail_silently"])
        self.assertIn("Reset your Giztrack password", kwargs["subject"])
        self.assertIn("https://app.giztrack.test/reset-password?uid=", kwargs["message"])
        self.assertNotIn("https://app.giztrack.test//reset-password", kwargs["message"])

    @override_settings(FRONTEND_URL="https://app.giztrack.test")
    @patch("apps.accounts.views.send_giztrack_email")
    def test_register_sends_welcome_email(self, mock_send_mail):
        csrf_client = APIClient(enforce_csrf_checks=True)
        csrf_client.get("/api/v1/auth/csrf/")
        csrf_token = csrf_client.cookies.get("csrftoken")

        response = csrf_client.post(
            "/api/v1/auth/register/",
            {
                "shop_name": "Fresh Gizmos",
                "shop_phone": "08012345678",
                "shop_address": "12 Lagos Street",
                "first_name": "Samuel",
                "last_name": "Owner",
                "email": "newowner@example.com",
                "password": "StrongPass123!",
                "confirm_password": "StrongPass123!",
            },
            format="json",
            HTTP_X_CSRFTOKEN=csrf_token.value,
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["user"]["email"], "newowner@example.com")
        mock_send_mail.assert_called_once()

        _, kwargs = mock_send_mail.call_args
        self.assertEqual(kwargs["recipient_list"], ["newowner@example.com"])
        self.assertFalse(kwargs["fail_silently"])
        self.assertIn("Welcome to Giztrack, Fresh Gizmos", kwargs["subject"])
        self.assertIn("https://app.giztrack.test/login", kwargs["message"])

    @patch("apps.accounts.views.send_giztrack_email", side_effect=Exception("smtp down"))
    def test_register_returns_201_even_if_welcome_email_fails(self, _mock_send_mail):
        csrf_client = APIClient(enforce_csrf_checks=True)
        csrf_client.get("/api/v1/auth/csrf/")
        csrf_token = csrf_client.cookies.get("csrftoken")

        response = csrf_client.post(
            "/api/v1/auth/register/",
            {
                "shop_name": "Fallback Repairs",
                "shop_phone": "08012345679",
                "first_name": "Amina",
                "last_name": "Owner",
                "email": "owner-fallback@example.com",
                "password": "StrongPass123!",
                "confirm_password": "StrongPass123!",
            },
            format="json",
            HTTP_X_CSRFTOKEN=csrf_token.value,
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertTrue(CustomUser.objects.filter(email="owner-fallback@example.com").exists())
        self.assertTrue(Shop.objects.filter(email="owner-fallback@example.com").exists())

    def test_reset_password_accepts_fresh_valid_token(self):
        csrf_client = APIClient(enforce_csrf_checks=True)
        csrf_client.get("/api/v1/auth/csrf/")
        csrf_token = csrf_client.cookies.get("csrftoken")
        uid = urlsafe_base64_encode(force_bytes(self.user.pk))
        token = default_token_generator.make_token(self.user)

        response = csrf_client.post(
            "/api/v1/auth/reset-password/",
            {
                "uid": uid,
                "token": token,
                "new_password": "FreshPass123!",
            },
            format="json",
            HTTP_X_CSRFTOKEN=csrf_token.value,
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password("FreshPass123!"))

    def test_refresh_alias_rotates_cookie_session(self):
        csrf_client = APIClient(enforce_csrf_checks=True)
        csrf_client.get("/api/v1/auth/csrf/")
        csrf_token = csrf_client.cookies.get("csrftoken")

        login_response = csrf_client.post(
            "/api/v1/auth/login/",
            {"email": self.user.email, "password": "StrongPass123!"},
            format="json",
            HTTP_X_CSRFTOKEN=csrf_token.value,
        )
        self.assertEqual(login_response.status_code, status.HTTP_200_OK)

        refresh_response = csrf_client.post(
            "/api/v1/auth/refresh/",
            {},
            format="json",
            HTTP_X_CSRFTOKEN=csrf_token.value,
        )

        self.assertEqual(refresh_response.status_code, status.HTTP_200_OK)
        self.assertIn(settings.AUTH_COOKIE_ACCESS, refresh_response.cookies)

    @override_settings(BOOTSTRAP_ADMIN_TOKEN="bootstrap-secret")
    def test_bootstrap_admin_creates_first_superuser_once(self):
        response = self.client.post(
            "/api/v1/auth/bootstrap-admin/",
            {
                "bootstrap_token": "bootstrap-secret",
                "email": "owner@Giztrack.com",
                "first_name": "Root",
                "last_name": "Admin",
                "password": "StrongPass123!",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertTrue(CustomUser.objects.filter(email="owner@Giztrack.com", is_superuser=True).exists())

        second_response = self.client.post(
            "/api/v1/auth/bootstrap-admin/",
            {
                "bootstrap_token": "bootstrap-secret",
                "email": "owner2@Giztrack.com",
                "first_name": "Another",
                "last_name": "Admin",
                "password": "StrongPass123!",
            },
            format="json",
        )

        self.assertEqual(second_response.status_code, status.HTTP_409_CONFLICT)

    def test_me_exposes_trial_access_as_pro_trial(self):
        self.client.force_authenticate(user=self.user)

        response = self.client.get("/api/v1/auth/me/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["subscription_plan"], "Pro Trial")
        self.assertEqual(response.data["subscription_status"], "trial")
        self.assertFalse(response.data["has_active_subscription"])
        self.assertTrue(response.data["has_app_access"])
        self.assertTrue(response.data["has_pro_access"])

    def test_me_exposes_basic_plan_as_paid_access_without_pro_features(self):
        basic_plan = Plan.objects.create(
            name="Basic",
            description="Core shop operations",
            price="5000.00",
            paystack_plan_code="PLN_test_basic_paid_access",
            features=["Inventory", "Sales", "Repairs"],
        )
        now = timezone.now()
        Shop.objects.filter(id=self.shop.id).update(
            created_at=now - timedelta(days=30),
            subscription_expires_at=now + timedelta(days=30),
        )
        Subscription.objects.create(
            shop=self.shop,
            plan=basic_plan,
            status=Subscription.Status.ACTIVE,
            current_period_start=now,
            current_period_end=now + timedelta(days=30),
        )
        self.shop.refresh_from_db()
        self.user.refresh_from_db()

        self.client.force_authenticate(user=self.user)
        response = self.client.get("/api/v1/auth/me/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["subscription_plan"], "Basic")
        self.assertEqual(response.data["subscription_status"], "active")
        self.assertTrue(response.data["has_active_subscription"])
        self.assertTrue(response.data["has_app_access"])
        self.assertFalse(response.data["has_pro_access"])

    def test_basic_plan_does_not_keep_trial_pro_access_after_payment(self):
        basic_plan = Plan.objects.create(
            name="Basic",
            description="Core shop operations",
            price="5000.00",
            paystack_plan_code="PLN_test_basic_trial_cutoff",
            features=["Inventory", "Sales", "Repairs"],
        )
        now = timezone.now()
        Shop.objects.filter(id=self.shop.id).update(
            created_at=now - timedelta(days=5),
            subscription_expires_at=now + timedelta(days=30),
        )
        Subscription.objects.create(
            shop=self.shop,
            plan=basic_plan,
            status=Subscription.Status.ACTIVE,
            current_period_start=now,
            current_period_end=now + timedelta(days=30),
        )
        self.shop.refresh_from_db()
        self.user.refresh_from_db()

        self.client.force_authenticate(user=self.user)
        response = self.client.get("/api/v1/auth/me/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["subscription_plan"], "Basic")
        self.assertTrue(response.data["has_active_subscription"])
        self.assertTrue(response.data["has_app_access"])
        self.assertFalse(response.data["has_pro_access"])

    def test_basic_plan_enforces_team_member_limit(self):
        basic_plan = Plan.objects.create(
            name="Basic",
            description="Core shop operations",
            price="5000.00",
            paystack_plan_code="PLN_test_basic_team_limit",
            max_users=1,
            features=["Inventory", "Sales", "Repairs"],
        )
        now = timezone.now()
        Shop.objects.filter(id=self.shop.id).update(
            created_at=now - timedelta(days=30),
            subscription_expires_at=now + timedelta(days=30),
        )
        Subscription.objects.create(
            shop=self.shop,
            plan=basic_plan,
            status=Subscription.Status.ACTIVE,
            current_period_start=now,
            current_period_end=now + timedelta(days=30),
        )
        self.shop.refresh_from_db()
        self.user.refresh_from_db()

        self.client.force_authenticate(user=self.user)
        response = self.client.post(
            "/api/v1/auth/staff/",
            {
                "email": "newstaff@example.com",
                "first_name": "New",
                "last_name": "Staff",
                "password": "StrongPass123!",
                "role": Role.STAFF,
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("detail", response.data)

    def test_staff_create_accepts_same_phone_format_used_by_frontend_forms(self):
        self.client.force_authenticate(user=self.user)

        response = self.client.post(
            "/api/v1/auth/staff/",
            {
                "email": "staffphone@example.com",
                "first_name": "Staff",
                "last_name": "Phone",
                "phone": "08012345678",
                "password": "StrongPass123!",
                "role": Role.STAFF,
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["email"], "staffphone@example.com")
        self.assertEqual(response.data["phone"], "08012345678")

    def test_deleted_subscription_does_not_leave_shop_active_from_stale_expiry(self):
        now = timezone.now()
        Shop.objects.filter(id=self.shop.id).update(
            created_at=now - timedelta(days=30),
            subscription_expires_at=now + timedelta(days=30),
        )
        self.shop.refresh_from_db()

        self.client.force_authenticate(user=self.user)
        response = self.client.get("/api/v1/auth/me/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIsNone(response.data["subscription_plan"])
        self.assertEqual(response.data["subscription_status"], "inactive")
        self.assertFalse(response.data["has_active_subscription"])
        self.assertFalse(response.data["has_app_access"])
        self.assertFalse(response.data["has_pro_access"])

    def test_change_password_enforces_django_password_validators(self):
        self.client.force_authenticate(user=self.user)

        response = self.client.post(
            "/api/v1/auth/change-password/",
            {
                "old_password": "StrongPass123!",
                "new_password": "password",
                "confirm_new_password": "password",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("details", response.data)
        self.assertIn("new_password", response.data["details"])
