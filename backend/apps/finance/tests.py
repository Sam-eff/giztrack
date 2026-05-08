from rest_framework import status
from rest_framework.test import APITestCase

from apps.accounts.models import CustomUser, Role
from apps.finance.models import Expense
from apps.shops.models import Shop


class StaffExpenseLoggingAccessTests(APITestCase):
    def setUp(self):
        self.shop = Shop.objects.create(
            name="Expense Shop",
            owner_name="Owner",
            email="expense@example.com",
            phone="08012345678",
            allow_staff_expense_logging=False,
        )
        self.staff = CustomUser.objects.create_user(
            email="staff@expense.com",
            password="StrongPass123!",
            first_name="Expense",
            last_name="Staff",
            shop=self.shop,
            role=Role.STAFF,
        )
        self.admin = CustomUser.objects.create_user(
            email="owner@expense.com",
            password="StrongPass123!",
            first_name="Shop",
            last_name="Owner",
            shop=self.shop,
            role=Role.ADMIN,
        )

    def _expense_payload(self):
        return {
            "amount": "3500.00",
            "category": Expense.Category.UTILITIES,
            "description": "Electricity bill",
            "date": "2026-05-08",
        }

    def test_staff_cannot_log_expense_when_setting_is_disabled(self):
        self.client.force_authenticate(user=self.staff)

        response = self.client.post(
            "/api/v1/finance/expenses/",
            self._expense_payload(),
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(Expense.objects.filter(shop=self.shop).count(), 0)
        self.assertIn("Staff members are not allowed", str(response.data["detail"]))

    def test_staff_can_view_expenses_when_logging_is_disabled(self):
        Expense.objects.create(
            shop=self.shop,
            amount="3500.00",
            category=Expense.Category.UTILITIES,
            description="Electricity bill",
            date="2026-05-08",
            logged_by=self.admin,
        )
        self.client.force_authenticate(user=self.staff)

        response = self.client.get("/api/v1/finance/expenses/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["count"], 1)

    def test_admin_can_log_expense_when_staff_setting_is_disabled(self):
        self.client.force_authenticate(user=self.admin)

        response = self.client.post(
            "/api/v1/finance/expenses/",
            self._expense_payload(),
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(Expense.objects.filter(shop=self.shop).count(), 1)
