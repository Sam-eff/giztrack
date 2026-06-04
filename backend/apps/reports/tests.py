from io import BytesIO
from zipfile import ZipFile

from datetime import timedelta
from unittest.mock import patch

from django.core.files.uploadedfile import SimpleUploadedFile
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from apps.accounts.models import CustomUser, Role
from apps.customers.models import Customer
from apps.finance.models import Expense
from apps.inventory.models import Category, Product
from apps.repairs.models import RepairTicket
from apps.sales.models import Sale, SaleItem, SalePayment
from apps.shops.models import Shop
from apps.subscriptions.models import Plan, Subscription


class ReportValidationTests(APITestCase):
    def setUp(self):
        self.shop = Shop.objects.create(
            name="Reports Shop",
            owner_name="Owner",
            email="reports@example.com",
            phone="08012345678",
        )
        self.user = CustomUser.objects.create_user(
            email="staff@reports.com",
            password="StrongPass123!",
            first_name="Staff",
            last_name="User",
            shop=self.shop,
            role=Role.STAFF,
        )

    def test_invalid_sales_report_dates_return_400(self):
        self.client.force_authenticate(user=self.user)

        response = self.client.get("/api/v1/reports/sales/?from=not-a-date")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_credit_customers_report_returns_outstanding_balances_for_current_shop(self):
        other_shop = Shop.objects.create(
            name="Other Shop",
            owner_name="Other Owner",
            email="other@example.com",
            phone="08087654321",
        )
        other_user = CustomUser.objects.create_user(
            email="other@reports.com",
            password="StrongPass123!",
            first_name="Other",
            last_name="User",
            shop=other_shop,
            role=Role.STAFF,
        )
        customer = Customer.objects.create(
            shop=self.shop,
            name="Jane Customer",
            phone="08022223333",
            email="jane@example.com",
        )
        other_customer = Customer.objects.create(
            shop=other_shop,
            name="Foreign Customer",
            phone="08099990000",
            email="foreign@example.com",
        )

        Sale.objects.create(
            shop=self.shop,
            customer=customer,
            staff=self.user,
            total_amount="25000.00",
            total_profit="5000.00",
            amount_paid="5000.00",
            is_credit=True,
        )
        Sale.objects.create(
            shop=self.shop,
            customer=customer,
            staff=self.user,
            total_amount="10000.00",
            total_profit="2000.00",
            amount_paid="10000.00",
            is_credit=True,
        )
        Sale.objects.create(
            shop=self.shop,
            customer=customer,
            staff=self.user,
            total_amount="12000.00",
            total_profit="2500.00",
            amount_paid="2000.00",
            is_credit=True,
        )
        Sale.objects.create(
            shop=other_shop,
            customer=other_customer,
            staff=other_user,
            total_amount="30000.00",
            total_profit="6000.00",
            amount_paid="0.00",
            is_credit=True,
        )

        self.client.force_authenticate(user=self.user)

        response = self.client.get("/api/v1/reports/customers/credit/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["summary"]["customers_with_balance"], 1)
        self.assertEqual(response.data["summary"]["total_credit_sales"], 2)
        self.assertEqual(str(response.data["summary"]["total_outstanding"]), "30000.00")
        self.assertEqual(len(response.data["results"]), 1)
        self.assertEqual(response.data["results"][0]["customer_name"], "Jane Customer")
        self.assertEqual(response.data["results"][0]["credit_sales_count"], 2)
        self.assertEqual(str(response.data["results"][0]["total_owed"]), "30000.00")

    def test_dashboard_uses_collected_cash_for_today_metrics(self):
        customer = Customer.objects.create(
            shop=self.shop,
            name="Credit Customer",
            phone="08011112222",
            email="credit@example.com",
        )

        today = timezone.now()
        yesterday = today - timezone.timedelta(days=1)

        cash_sale = Sale.objects.create(
            shop=self.shop,
            customer=customer,
            staff=self.user,
            total_amount="6000.00",
            total_profit="2000.00",
            amount_paid="6000.00",
            is_credit=False,
        )
        Sale.objects.filter(id=cash_sale.id).update(created_at=today)
        SalePayment.objects.create(
            sale=cash_sale,
            amount="6000.00",
            received_by=self.user,
            created_at=today,
        )

        credit_sale = Sale.objects.create(
            shop=self.shop,
            customer=customer,
            staff=self.user,
            total_amount="10000.00",
            total_profit="4000.00",
            amount_paid="1000.00",
            is_credit=True,
        )
        Sale.objects.filter(id=credit_sale.id).update(created_at=today)
        SalePayment.objects.create(
            sale=credit_sale,
            amount="1000.00",
            received_by=self.user,
            created_at=today,
        )

        older_credit_sale = Sale.objects.create(
            shop=self.shop,
            customer=customer,
            staff=self.user,
            total_amount="8000.00",
            total_profit="3200.00",
            amount_paid="2000.00",
            is_credit=True,
        )
        Sale.objects.filter(id=older_credit_sale.id).update(created_at=yesterday)
        SalePayment.objects.create(
            sale=older_credit_sale,
            amount="2000.00",
            received_by=self.user,
            created_at=today,
        )

        Expense.objects.create(
            shop=self.shop,
            amount="500.00",
            category=Expense.Category.SUPPLIES,
            description="Daily supplies",
            date=today.date(),
            logged_by=self.user,
        )

        self.client.force_authenticate(user=self.user)
        response = self.client.get("/api/v1/reports/dashboard/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["sales_today"]["count"], 2)
        self.assertEqual(response.data["sales_today"]["payment_count"], 3)
        self.assertEqual(str(response.data["sales_today"]["sales_value"]), "16000.00")
        self.assertEqual(str(response.data["sales_today"]["cash_received"]), "9000.00")
        self.assertEqual(str(response.data["sales_today"]["profit"]), "2700.00")
        self.assertEqual(str(response.data["credit"]["outstanding"]), "15000.00")
        self.assertEqual(response.data["credit"]["customers_with_balance"], 1)

    def test_basic_plan_cannot_access_pro_reports(self):
        basic_plan = Plan.objects.create(
            name="Basic",
            description="Core operations",
            price="3000.00",
            paystack_plan_code="PLN_test_basic_reports_gate",
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
        response = self.client.get("/api/v1/reports/sales/")

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_reports_csv_export_returns_filtered_analytics_sections(self):
        report_date = timezone.now().date()
        customer = Customer.objects.create(
            shop=self.shop,
            name="Analytics Customer",
            phone="08012340000",
            email="analytics@example.com",
        )

        Sale.objects.create(
            shop=self.shop,
            customer=customer,
            staff=self.user,
            total_amount="15000.00",
            total_profit="4000.00",
            amount_paid="15000.00",
            is_credit=False,
        )
        Expense.objects.create(
            shop=self.shop,
            amount="2500.00",
            category=Expense.Category.SUPPLIES,
            description="Paper rolls",
            date=report_date,
            logged_by=self.user,
        )

        self.client.force_authenticate(user=self.user)
        response = self.client.get(
            f"/api/v1/reports/export/?download_format=csv&period=daily&from={report_date}&to={report_date}"
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("text/csv", response["Content-Type"])
        content = response.content.decode("utf-8-sig")
        self.assertIn("Giztrack Analytics Report", content)
        self.assertIn("Sales Breakdown", content)
        self.assertIn("Best Selling Products", content)
        self.assertNotIn("Products,Category,SKU,Brand", content)

    def test_shop_backup_zip_export_contains_separate_csv_files(self):
        admin_user = CustomUser.objects.create_user(
            email="admin@reports.com",
            password="StrongPass123!",
            first_name="Admin",
            last_name="User",
            shop=self.shop,
            role=Role.ADMIN,
        )
        customer = Customer.objects.create(
            shop=self.shop,
            name="Backup Customer",
            phone="08030000000",
            email="backup@example.com",
        )
        product = Product.objects.create(
            shop=self.shop,
            name="USB Cable",
            cost_price="1000.00",
            selling_price="2500.00",
            quantity=12,
            sku="USB-001",
        )
        sale = Sale.objects.create(
            shop=self.shop,
            customer=customer,
            staff=admin_user,
            total_amount="2500.00",
            total_profit="1500.00",
            amount_paid="1000.00",
            is_credit=True,
        )
        SalePayment.objects.create(
            sale=sale,
            amount="1000.00",
            received_by=admin_user,
            note="Deposit",
        )
        RepairTicket.objects.create(
            shop=self.shop,
            customer=customer,
            technician=admin_user,
            device_type="Phone",
            device_model="iPhone 12",
            issue_description="Screen issue",
            estimated_cost="18000.00",
            amount_paid="5000.00",
        )

        self.client.force_authenticate(user=admin_user)
        response = self.client.get("/api/v1/reports/export/backup/?download_format=zip")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response["Content-Type"], "application/zip")

        archive = ZipFile(BytesIO(response.content))
        names = set(archive.namelist())

        self.assertTrue({
            "README.txt",
            "summary.csv",
            "categories.csv",
            "products.csv",
            "customers.csv",
            "sales.csv",
            "sale_items.csv",
            "payments.csv",
            "expenses.csv",
            "repairs.csv",
            "repair_parts.csv",
            "stock_logs.csv",
        }.issubset(names))

        products_csv = archive.read("products.csv").decode("utf-8-sig")
        sales_csv = archive.read("sales.csv").decode("utf-8-sig")

        self.assertIn("USB Cable", products_csv)
        self.assertIn("Sale ID,Customer Phone,Customer Name,Staff Email,Total Amount,Total Profit,Discount Amount,Amount Paid,Balance Owed,Credit Sale,Note,Created", sales_csv)

    def test_shop_backup_preview_returns_dataset_summary_without_importing(self):
        admin_user = CustomUser.objects.create_user(
            email="preview-admin@reports.com",
            password="StrongPass123!",
            first_name="Preview",
            last_name="Admin",
            shop=self.shop,
            role=Role.ADMIN,
        )
        customer = Customer.objects.create(
            shop=self.shop,
            name="Preview Customer",
            phone="08040000000",
            email="preview@example.com",
        )
        Product.objects.create(
            shop=self.shop,
            name="Type-C Charger",
            cost_price="5000.00",
            selling_price="8500.00",
            quantity=8,
            sku="CHARGER-01",
        )
        sale = Sale.objects.create(
            shop=self.shop,
            customer=customer,
            staff=admin_user,
            total_amount="8500.00",
            total_profit="3500.00",
            amount_paid="8500.00",
            is_credit=False,
        )
        SalePayment.objects.create(
            sale=sale,
            amount="8500.00",
            received_by=admin_user,
            note="Full payment",
        )

        self.client.force_authenticate(user=admin_user)
        export_response = self.client.get("/api/v1/reports/export/backup/?download_format=zip")
        self.assertEqual(export_response.status_code, status.HTTP_200_OK)

        uploaded_file = SimpleUploadedFile(
            "shop_backup_test.zip",
            export_response.content,
            content_type="application/zip",
        )

        preview_response = self.client.post(
            "/api/v1/reports/import/preview/",
            {"file": uploaded_file},
            format="multipart",
        )

        self.assertEqual(preview_response.status_code, status.HTTP_200_OK)
        self.assertEqual(preview_response.data["shop_name"], self.shop.name)
        self.assertEqual(preview_response.data["totals"]["products"], 1)
        self.assertEqual(preview_response.data["totals"]["sales"], 1)
        self.assertEqual(preview_response.data["totals"]["payments"], 1)
        self.assertEqual(preview_response.data["confirmation_phrase"], "RESTORE MY SHOP DATA")
        self.assertTrue(any(dataset["key"] == "products" for dataset in preview_response.data["datasets"]))

    @patch("apps.reports.views.MAX_BACKUP_CSV_ROWS", 1)
    def test_shop_backup_preview_rejects_backup_with_too_many_rows(self):
        admin_user = CustomUser.objects.create_user(
            email="oversized-admin@reports.com",
            password="StrongPass123!",
            first_name="Oversized",
            last_name="Admin",
            shop=self.shop,
            role=Role.ADMIN,
        )
        pro_plan = Plan.objects.create(
            name="Pro",
            description="Advanced operations",
            price="7000.00",
            paystack_plan_code="PLN_reports_oversized_backup",
            interval="monthly",
        )
        period_end = timezone.now() + timedelta(days=30)
        Subscription.objects.create(
            shop=self.shop,
            plan=pro_plan,
            status=Subscription.Status.ACTIVE,
            current_period_end=period_end,
        )
        self.shop.subscription_expires_at = period_end
        self.shop.save(update_fields=["subscription_expires_at"])

        buffer = BytesIO()
        with ZipFile(buffer, "w") as archive:
            archive.writestr("summary.csv", "Metric,Value\nShop Name,Reports Shop\n")
            archive.writestr(
                "products.csv",
                "Name,Cost Price,Selling Price,Quantity\nA,1.00,2.00,1\nB,1.00,2.00,1\n",
            )
            archive.writestr("customers.csv", "Name,Phone\n")
            archive.writestr("sales.csv", "Sale ID,Total Amount\n")
            archive.writestr("payments.csv", "Sale ID,Amount\n")
            archive.writestr("repairs.csv", "Ticket ID,Device Type\n")

        self.client.force_authenticate(user=admin_user)
        uploaded_file = SimpleUploadedFile(
            "oversized_backup.zip",
            buffer.getvalue(),
            content_type="application/zip",
        )
        response = self.client.post(
            "/api/v1/reports/import/preview/",
            {"file": uploaded_file},
            format="multipart",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("products.csv contains too many rows", str(response.data))

    def test_shop_backup_apply_replaces_current_shop_business_data(self):
        admin_user = CustomUser.objects.create_user(
            email="restore-admin@reports.com",
            password="StrongPass123!",
            first_name="Restore",
            last_name="Admin",
            shop=self.shop,
            role=Role.ADMIN,
        )
        category = Category.objects.create(shop=self.shop, name="Accessories")
        customer = Customer.objects.create(
            shop=self.shop,
            name="Restore Customer",
            phone="08050000000",
            email="restore@example.com",
        )
        product = Product.objects.create(
            shop=self.shop,
            category=category,
            name="Lightning Cable",
            cost_price="1500.00",
            selling_price="3000.00",
            quantity=10,
            sku="LIGHT-01",
        )
        sale = Sale.objects.create(
            shop=self.shop,
            customer=customer,
            staff=admin_user,
            total_amount="3000.00",
            total_profit="1500.00",
            amount_paid="1500.00",
            is_credit=True,
            note="Restore test sale",
        )
        SaleItem.objects.create(
            sale=sale,
            product=product,
            product_name=product.name,
            quantity=1,
            unit_price="3000.00",
            unit_cost="1500.00",
            is_custom=False,
            returned_quantity=0,
        )
        SalePayment.objects.create(
            sale=sale,
            amount="1500.00",
            received_by=admin_user,
            note="Deposit",
        )
        Expense.objects.create(
            shop=self.shop,
            amount="500.00",
            category=Expense.Category.SUPPLIES,
            description="Restore packing",
            date=timezone.localdate(),
            logged_by=admin_user,
        )
        RepairTicket.objects.create(
            shop=self.shop,
            customer=customer,
            technician=admin_user,
            device_type="Phone",
            device_model="Samsung S21",
            issue_description="Charging port",
            estimated_cost="12000.00",
            amount_paid="2000.00",
            note="Repair note",
        )

        self.client.force_authenticate(user=admin_user)
        export_response = self.client.get("/api/v1/reports/export/backup/?download_format=zip")
        self.assertEqual(export_response.status_code, status.HTTP_200_OK)

        Product.objects.create(
            shop=self.shop,
            name="Should Disappear",
            cost_price="100.00",
            selling_price="200.00",
            quantity=1,
            sku="DELETE-ME",
        )
        Customer.objects.create(
            shop=self.shop,
            name="Temporary Customer",
            phone="08059999999",
        )

        uploaded_file = SimpleUploadedFile(
            "restore_backup.zip",
            export_response.content,
            content_type="application/zip",
        )
        restore_response = self.client.post(
            "/api/v1/reports/import/apply/",
            {"file": uploaded_file, "confirmation": "  restore   my   shop data  "},
            format="multipart",
        )

        self.assertEqual(restore_response.status_code, status.HTTP_200_OK)
        self.assertEqual(Product.objects.filter(shop=self.shop, name="Lightning Cable").count(), 1)
        self.assertFalse(Product.objects.filter(shop=self.shop, name="Should Disappear").exists())
        self.assertFalse(Customer.objects.filter(shop=self.shop, phone="08059999999").exists())
        self.assertEqual(Sale.objects.filter(shop=self.shop).count(), 1)
        self.assertEqual(SaleItem.objects.filter(sale__shop=self.shop).count(), 1)
        self.assertEqual(Expense.objects.filter(shop=self.shop).count(), 1)
        self.assertEqual(CustomUser.objects.filter(shop=self.shop, email="restore-admin@reports.com").count(), 1)
