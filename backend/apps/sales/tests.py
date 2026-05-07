from datetime import timedelta

from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from apps.accounts.models import CustomUser, Role
from apps.customers.models import Customer
from apps.shops.models import Shop
from apps.subscriptions.models import Plan, Subscription
from .models import Sale, SalePayment


class SalePaymentFlowTests(APITestCase):
    def setUp(self):
        self.shop = Shop.objects.create(
            name="Sales Shop",
            owner_name="Owner",
            email="sales@example.com",
            phone="08012345678",
        )
        self.user = CustomUser.objects.create_user(
            email="staff@sales.com",
            password="StrongPass123!",
            first_name="Sales",
            last_name="Staff",
            shop=self.shop,
            role=Role.STAFF,
        )
        self.customer = Customer.objects.create(
            shop=self.shop,
            name="Credit Buyer",
            phone="08077778888",
            email="buyer@example.com",
        )
        self.sale = Sale.objects.create(
            shop=self.shop,
            customer=self.customer,
            staff=self.user,
            total_amount="5000.00",
            total_profit="1500.00",
            amount_paid="1000.00",
            is_credit=True,
        )
        SalePayment.objects.create(
            sale=self.sale,
            amount="1000.00",
            note="Initial payment",
            received_by=self.user,
            created_at=self.sale.created_at,
        )
        self.client.force_authenticate(user=self.user)

    def test_record_payment_updates_sale_balance_and_creates_ledger_entry(self):
        response = self.client.post(
            f"/api/v1/sales/{self.sale.id}/record-payment/",
            {"amount": "1500.00", "note": "Customer paid more"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)

        self.sale.refresh_from_db()
        payment = self.sale.payments.order_by("-created_at", "-id").first()

        self.assertEqual(str(self.sale.amount_paid), "2500.00")
        self.assertEqual(self.sale.payments.count(), 2)
        self.assertEqual(str(payment.amount), "1500.00")
        self.assertEqual(payment.note, "Customer paid more")
        self.assertEqual(str(response.data["sale"]["balance_owed"]), "2500.00")

    def test_record_payment_rejects_overpayment(self):
        response = self.client.post(
            f"/api/v1/sales/{self.sale.id}/record-payment/",
            {"amount": "5000.00"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(self.sale.payments.count(), 1)
        self.assertIn("outstanding balance", response.data["error"])

    def test_record_payment_respects_staff_sales_setting(self):
        self.shop.allow_staff_sales = False
        self.shop.save(update_fields=["allow_staff_sales"])

        response = self.client.post(
            f"/api/v1/sales/{self.sale.id}/record-payment/",
            {"amount": "1500.00", "note": "Customer paid more"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.sale.refresh_from_db()
        self.assertEqual(str(self.sale.amount_paid), "1000.00")
        self.assertEqual(self.sale.payments.count(), 1)


class SalePlanAccessTests(APITestCase):
    def setUp(self):
        self.shop = Shop.objects.create(
            name="Plan Shop",
            owner_name="Owner",
            email="plan@example.com",
            phone="08012345678",
        )
        self.user = CustomUser.objects.create_user(
            email="owner@plan.com",
            password="StrongPass123!",
            first_name="Plan",
            last_name="Owner",
            shop=self.shop,
            role=Role.ADMIN,
        )
        self.client.force_authenticate(user=self.user)

    def test_trial_shop_can_create_sale_with_custom_item(self):
        response = self.client.post(
            "/api/v1/sales/",
            {
                "items": [
                    {
                        "product_name": "Quick Service Fee",
                        "unit_price": "2500.00",
                        "quantity": 1,
                    }
                ],
                "discount_amount": "500.00",
                "is_credit": False,
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["sale"]["items"][0]["product_name"], "Quick Service Fee")
        self.assertTrue(response.data["sale"]["items"][0]["is_custom"])

    def test_trial_shop_can_apply_discount(self):
        response = self.client.post(
            "/api/v1/sales/",
            {
                "items": [
                    {
                        "product_name": "Quick Service Fee",
                        "unit_price": "2500.00",
                        "quantity": 1,
                    }
                ],
                "discount_amount": "500.00",
                "is_credit": False,
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["sale"]["discount_amount"], "500.00")
        self.assertEqual(response.data["sale"]["total_amount"], "2000.00")

    def test_basic_subscription_blocks_custom_items_after_trial_access_ends(self):
        basic_plan = Plan.objects.create(
            name="Basic",
            description="Core shop operations",
            price="5000.00",
            paystack_plan_code="PLN_test_basic_custom_items_blocked",
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

        response = self.client.post(
            "/api/v1/sales/",
            {
                "items": [
                    {
                        "product_name": "Quick Service Fee",
                        "unit_price": "2500.00",
                        "quantity": 1,
                    }
                ],
                "is_credit": False,
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(response.data["error"], "Custom ad-hoc items require the Pro plan.")

    def test_basic_subscription_blocks_discount_after_trial_access_ends(self):
        basic_plan = Plan.objects.create(
            name="Basic",
            description="Core shop operations",
            price="5000.00",
            paystack_plan_code="PLN_test_basic_discount_blocked",
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

        response = self.client.post(
            "/api/v1/sales/",
            {
                "items": [
                    {
                        "product_name": "Quick Service Fee",
                        "unit_price": "2500.00",
                        "quantity": 1,
                    }
                ],
                "discount_amount": "500.00",
                "is_credit": False,
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(response.data["error"], "Applying discounts requires the Pro plan.")


class StaffSalesAccessTests(APITestCase):
    def setUp(self):
        self.shop = Shop.objects.create(
            name="Restricted Shop",
            owner_name="Owner",
            email="restricted@example.com",
            phone="08012345678",
            allow_staff_sales=False,
        )
        self.staff = CustomUser.objects.create_user(
            email="staff@restricted.com",
            password="StrongPass123!",
            first_name="Sales",
            last_name="Staff",
            shop=self.shop,
            role=Role.STAFF,
        )
        self.admin = CustomUser.objects.create_user(
            email="owner@restricted.com",
            password="StrongPass123!",
            first_name="Shop",
            last_name="Owner",
            shop=self.shop,
            role=Role.ADMIN,
        )

    def _sale_payload(self):
        return {
            "items": [
                {
                    "product_name": "Quick Service Fee",
                    "unit_price": "2500.00",
                    "quantity": 1,
                }
            ],
            "is_credit": False,
        }

    def test_staff_cannot_create_sale_when_setting_is_disabled(self):
        self.client.force_authenticate(user=self.staff)

        response = self.client.post(
            "/api/v1/sales/",
            self._sale_payload(),
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(Sale.objects.filter(shop=self.shop).count(), 0)
        self.assertIn("Staff members are not allowed", response.data["error"])

    def test_admin_can_create_sale_when_staff_setting_is_disabled(self):
        self.client.force_authenticate(user=self.admin)

        response = self.client.post(
            "/api/v1/sales/",
            self._sale_payload(),
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(Sale.objects.filter(shop=self.shop).count(), 1)
