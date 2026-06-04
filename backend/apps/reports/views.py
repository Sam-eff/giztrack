from decimal import Decimal
from io import BytesIO, StringIO, TextIOWrapper
from zipfile import ZIP_DEFLATED, BadZipFile, ZipFile

from django.db import transaction
from django.db.models import Sum, Count, F, Q, DecimalField, Max
from django.db.models.functions import TruncDay, TruncWeek, TruncMonth
from django.utils import timezone
from django.utils.dateparse import parse_date, parse_datetime
from datetime import datetime, timedelta
from rest_framework import serializers
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework.parsers import MultiPartParser, FormParser
import csv
from django.http import HttpResponse

from utils.permissions import IsAdmin, IsAdminOrStaff, IsProPlan
from apps.accounts.models import CustomUser
from apps.inventory.models import Category, Product, StockLog
from apps.sales.models import Sale, SaleItem, SalePayment
from apps.repairs.models import RepairTicket, RepairPart
from apps.finance.models import Expense
from apps.customers.models import Customer


def format_money(value):
    amount = value if value is not None else Decimal("0.00")
    return f"{Decimal(amount):.2f}"


def decimal_money(value):
    amount = value if value is not None else Decimal("0.00")
    return Decimal(amount).quantize(Decimal("0.01"))


def format_date(value):
    if not value:
        return ""
    if hasattr(value, "date"):
        value = value.date()
    return value.isoformat()


def format_datetime(value):
    if not value:
        return ""
    local_value = timezone.localtime(value) if timezone.is_aware(value) else value
    return local_value.strftime("%Y-%m-%d %H:%M")


def write_csv_section(writer, title, headers, rows):
    writer.writerow([title])
    writer.writerow(headers)
    for row in rows:
        writer.writerow(row)
    writer.writerow([])


def rows_or_placeholder(headers, rows, empty_label="No records found"):
    if rows:
        return rows
    return [[empty_label] + [""] * (len(headers) - 1)]


def render_csv_document(title, subtitle_lines, sections):
    buffer = StringIO(newline="")
    writer = csv.writer(buffer)
    writer.writerow([title])
    for line in subtitle_lines:
        writer.writerow([line])
    writer.writerow([])
    for section in sections:
        write_csv_section(
            writer,
            section["title"],
            section["headers"],
            rows_or_placeholder(section["headers"], section["rows"]),
        )
    return "\ufeff" + buffer.getvalue()


def build_csv_response(filename, title, subtitle_lines, sections):
    response = HttpResponse(render_csv_document(title, subtitle_lines, sections), content_type="text/csv; charset=utf-8")
    response["Content-Disposition"] = f'attachment; filename="{filename}"'
    return response


def build_pdf_response(filename, title, subtitle_lines, sections):
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4, landscape
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle

    buffer = BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=landscape(A4),
        rightMargin=24,
        leftMargin=24,
        topMargin=24,
        bottomMargin=24,
    )
    styles = getSampleStyleSheet()
    normal = styles["BodyText"]
    normal.fontSize = 9
    normal.leading = 12

    title_style = styles["Heading1"]
    title_style.alignment = 1

    section_style = ParagraphStyle(
        "SectionHeading",
        parent=styles["Heading2"],
        textColor=colors.HexColor("#1d4ed8"),
        spaceAfter=8,
    )

    elements = [Paragraph(title, title_style), Spacer(1, 8)]
    for line in subtitle_lines:
        elements.append(Paragraph(line, normal))
    elements.append(Spacer(1, 14))

    def wrap_cell(value):
        text = "" if value is None else str(value)
        return Paragraph(text.replace("\n", "<br/>"), normal)

    for section in sections:
        elements.append(Paragraph(section["title"], section_style))
        if section.get("note"):
            elements.append(Paragraph(section["note"], normal))
            elements.append(Spacer(1, 6))

        table_data = [[Paragraph(f"<b>{header}</b>", normal) for header in section["headers"]]]
        for row in section["rows"]:
            table_data.append([wrap_cell(cell) for cell in row])

        table = Table(table_data, repeatRows=1)
        table.setStyle(
            TableStyle(
                [
                    ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1d4ed8")),
                    ("TEXTCOLOR", (0, 0), (-1, 0), colors.whitesmoke),
                    ("ALIGN", (0, 0), (-1, -1), "LEFT"),
                    ("VALIGN", (0, 0), (-1, -1), "TOP"),
                    ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                    ("BOTTOMPADDING", (0, 0), (-1, 0), 8),
                    ("TOPPADDING", (0, 1), (-1, -1), 6),
                    ("BOTTOMPADDING", (0, 1), (-1, -1), 6),
                    ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#dbe2ea")),
                    ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f8fafc")]),
                ]
            )
        )
        elements.append(table)
        elements.append(Spacer(1, 16))

    doc.build(elements)
    pdf_bytes = buffer.getvalue()
    buffer.close()

    response = HttpResponse(pdf_bytes, content_type="application/pdf")
    response["Content-Disposition"] = f'attachment; filename="{filename}"'
    return response


def build_report_export_sections(payload):
    summary = payload["summary"]

    return [
        {
            "title": "Report Summary",
            "headers": ["Metric", "Value"],
            "rows": [
                ["Period", payload["period"].capitalize()],
                ["Date From", format_date(payload["from"])],
                ["Date To", format_date(payload["to"])],
                ["Total Revenue", format_money(summary["total_revenue"])],
                ["Gross Profit", format_money(summary["total_gross_profit"])],
                ["Total Expenses", format_money(summary["total_expenses"])],
                ["Net Profit", format_money(summary["total_net_profit"])],
                ["Total Sales", summary["total_sales"]],
            ],
        },
        {
            "title": "Sales Breakdown",
            "headers": ["Period", "Revenue", "Gross Profit", "Expenses", "Net Profit", "Sales Count"],
            "rows": [
                [
                    row["period"],
                    format_money(row["revenue"]),
                    format_money(row["gross_profit"]),
                    format_money(row["expenses"]),
                    format_money(row["net_profit"]),
                    row["sale_count"],
                ]
                for row in payload["breakdown"]
            ],
        },
        {
            "title": "Best Selling Products",
            "headers": ["Product", "Quantity Sold", "Revenue", "Profit"],
            "rows": [
                [
                    row["product_name"],
                    row["total_qty"] or 0,
                    format_money(row["total_revenue"]),
                    format_money(row["total_profit"]),
                ]
                for row in payload["best_sellers"]
            ],
        },
        {
            "title": "Technician Performance",
            "headers": ["Technician", "Assigned", "Completed", "Revenue"],
            "rows": [
                [
                    f"{row['technician__first_name']} {row['technician__last_name']}".strip(),
                    row["total_assigned"] or 0,
                    row["total_completed"] or 0,
                    format_money(row["total_revenue"]),
                ]
                for row in payload["technicians"]
            ],
        },
        {
            "title": "Low Stock Products",
            "headers": ["Product", "Category", "Quantity", "Threshold", "Selling Price"],
            "rows": [
                [
                    row.name,
                    row.category.name if row.category else "Uncategorised",
                    row.quantity,
                    row.low_stock_threshold,
                    format_money(row.selling_price),
                ]
                for row in payload["low_stock"]
            ],
        },
        {
            "title": "Credit Summary",
            "headers": ["Metric", "Value"],
            "rows": [
                ["Customers With Balance", payload["credit_summary"]["customers_with_balance"]],
                ["Outstanding Credit Sales", payload["credit_summary"]["total_credit_sales"]],
                ["Total Amount Owed", format_money(payload["credit_summary"]["total_outstanding"])],
            ],
        },
        {
            "title": "Customers Owing On Credit",
            "headers": ["Customer", "Phone", "Email", "Credit Sales", "Credit Amount", "Paid", "Owed", "Last Credit Sale"],
            "rows": [
                [
                    row["customer__name"],
                    row["customer__phone"] or "",
                    row["customer__email"] or "",
                    row["credit_sales_count"] or 0,
                    format_money(row["total_credit_amount"]),
                    format_money(row["total_paid"]),
                    format_money(row["total_owed"]),
                    format_datetime(row["last_credit_sale_at"]),
                ]
                for row in payload["credit_customers"]
            ],
        },
        {
            "title": "Repair Status Summary",
            "headers": ["Status", "Count"],
            "rows": [
                [row["status"].replace("_", " ").title(), row["count"]]
                for row in payload["repair_statuses"]
            ],
        },
    ]


def build_shop_backup_sections(payload):
    shop = payload["shop"]
    summary = payload["summary"]

    return [
        {
            "title": "Backup Summary",
            "headers": ["Metric", "Value"],
            "rows": [
                ["Shop Name", shop.name],
                ["Generated At", format_datetime(payload["generated_at"])],
                ["Categories", summary["categories"]],
                ["Products", summary["products"]],
                ["Customers", summary["customers"]],
                ["Sales", summary["sales"]],
                ["Sale Items", summary["sale_items"]],
                ["Payments", summary["payments"]],
                ["Expenses", summary["expenses"]],
                ["Repairs", summary["repairs"]],
                ["Repair Parts", summary["repair_parts"]],
                ["Stock Logs", summary["stock_logs"]],
            ],
        },
        {
            "title": "Categories",
            "headers": ["Name", "Created"],
            "rows": [
                [
                    category.name,
                    format_datetime(category.created_at),
                ]
                for category in payload["categories"]
            ],
        },
        {
            "title": "Products",
            "headers": ["Name", "Category", "SKU", "Brand", "Model", "Color", "Cost Price", "Selling Price", "Quantity", "Low Stock Threshold", "Active"],
            "rows": [
                [
                    product.name,
                    product.category.name if product.category else "Uncategorised",
                    product.sku or "",
                    product.brand or "",
                    product.product_model or "",
                    product.color or "",
                    format_money(product.cost_price),
                    format_money(product.selling_price),
                    product.quantity,
                    product.low_stock_threshold,
                    "Yes" if product.is_active else "No",
                ]
                for product in payload["products"]
            ],
        },
        {
            "title": "Customers",
            "headers": ["Name", "Phone", "Email", "Address", "Created"],
            "rows": [
                [
                    customer.name,
                    customer.phone or "",
                    customer.email or "",
                    customer.address or "",
                    format_datetime(customer.created_at),
                ]
                for customer in payload["customers"]
            ],
        },
        {
            "title": "Sales",
            "headers": ["Sale ID", "Customer Phone", "Staff Email", "Total Amount", "Total Profit", "Discount", "Amount Paid", "Balance Owed", "Credit Sale", "Created"],
            "rows": [
                [
                    sale.id,
                    sale.customer.phone if sale.customer else "",
                    sale.staff.email if sale.staff else "",
                    format_money(sale.total_amount),
                    format_money(sale.total_profit),
                    format_money(sale.discount_amount),
                    format_money(sale.amount_paid),
                    format_money(sale.balance_owed),
                    "Yes" if sale.is_credit else "No",
                    format_datetime(sale.created_at),
                ]
                for sale in payload["sales"]
            ],
        },
        {
            "title": "Sale Items",
            "headers": ["Sale ID", "Product SKU", "Product Name", "Quantity", "Unit Price", "Unit Cost", "Custom Item", "Returned Quantity"],
            "rows": [
                [
                    item.sale_id,
                    item.product.sku if item.product else "",
                    item.product_name,
                    item.quantity,
                    format_money(item.unit_price),
                    format_money(item.unit_cost),
                    "Yes" if item.is_custom else "No",
                    item.returned_quantity,
                ]
                for item in payload["sale_items"]
            ],
        },
        {
            "title": "Sale Payments",
            "headers": ["Sale ID", "Amount", "Received By Email", "Note", "Created"],
            "rows": [
                [
                    payment.sale_id,
                    format_money(payment.amount),
                    payment.received_by.email if payment.received_by else "",
                    payment.note or "",
                    format_datetime(payment.created_at),
                ]
                for payment in payload["payments"]
            ],
        },
        {
            "title": "Expenses",
            "headers": ["Amount", "Category", "Description", "Date", "Logged By Email"],
            "rows": [
                [
                    format_money(expense.amount),
                    expense.category,
                    expense.description,
                    format_date(expense.date),
                    expense.logged_by.email if expense.logged_by else "",
                ]
                for expense in payload["expenses"]
            ],
        },
        {
            "title": "Repairs",
            "headers": ["Repair ID", "Customer Phone", "Technician Email", "Device Type", "Device Model", "Status", "Estimated Cost", "Final Cost", "Amount Paid", "Created"],
            "rows": [
                [
                    repair.id,
                    repair.customer.phone if repair.customer else "",
                    repair.technician.email if repair.technician else "",
                    repair.device_type,
                    repair.device_model,
                    repair.status,
                    format_money(repair.estimated_cost),
                    format_money(repair.final_cost),
                    format_money(repair.amount_paid),
                    format_datetime(repair.created_at),
                ]
                for repair in payload["repairs"]
            ],
        },
        {
            "title": "Repair Parts",
            "headers": ["Repair ID", "Product SKU", "Product Name", "Quantity Used", "Unit Cost"],
            "rows": [
                [
                    part.ticket_id,
                    part.product.sku if part.product else "",
                    part.product_name,
                    part.quantity_used,
                    format_money(part.unit_cost),
                ]
                for part in payload["repair_parts"]
            ],
        },
    ]


def render_csv_table(headers, rows):
    buffer = StringIO(newline="")
    writer = csv.writer(buffer)
    writer.writerow(headers)
    for row in rows:
        writer.writerow(row)
    return "\ufeff" + buffer.getvalue()


BACKUP_REQUIRED_FILES = [
    ("summary.csv", "Summary"),
    ("products.csv", "Products"),
    ("customers.csv", "Customers"),
    ("sales.csv", "Sales"),
    ("payments.csv", "Payments"),
    ("repairs.csv", "Repairs"),
]

BACKUP_OPTIONAL_FILES = [
    ("categories.csv", "Categories"),
    ("sale_items.csv", "Sale Items"),
    ("expenses.csv", "Expenses"),
    ("repair_parts.csv", "Repair Parts"),
    ("stock_logs.csv", "Stock Logs"),
]

BACKUP_PREVIEW_FILES = BACKUP_REQUIRED_FILES + BACKUP_OPTIONAL_FILES

RESTORE_CONFIRMATION_PHRASE = "RESTORE MY SHOP DATA"
MAX_BACKUP_UPLOAD_BYTES = 10 * 1024 * 1024
MAX_BACKUP_UNCOMPRESSED_BYTES = 25 * 1024 * 1024
MAX_BACKUP_ZIP_MEMBERS = 25
MAX_BACKUP_CSV_ROWS = 50000
ALLOWED_BACKUP_FILENAMES = {name for name, _label in BACKUP_PREVIEW_FILES} | {"README.txt"}


def normalize_restore_confirmation(value):
    return " ".join(str(value or "").split()).upper()


def clean_text(value):
    if value is None:
        return ""
    return str(value).strip()


def parse_int_value(value, default=0):
    text = clean_text(value)
    if not text:
        return default
    try:
        return int(text)
    except (TypeError, ValueError):
        return default


def parse_decimal_value(value, default="0.00"):
    text = clean_text(value)
    if not text:
        return Decimal(default)
    try:
        return Decimal(text)
    except Exception:
        return Decimal(default)


def parse_bool_value(value):
    return clean_text(value).lower() in {"1", "true", "yes", "y"}


def parse_date_value(value):
    text = clean_text(value)
    return parse_date(text) if text else None


def parse_datetime_value(value):
    text = clean_text(value)
    if not text:
        return None
    parsed = parse_datetime(text)
    if parsed is None:
        try:
            parsed = datetime.strptime(text, "%Y-%m-%d %H:%M")
        except ValueError:
            return None
    if timezone.is_naive(parsed):
        return timezone.make_aware(parsed, timezone.get_current_timezone())
    return parsed


def product_lookup_key(sku, name):
    sku_value = clean_text(sku)
    if sku_value:
        return f"sku::{sku_value.lower()}"
    return f"name::{clean_text(name).lower()}"


def read_backup_zip(uploaded_file, required_files=None):
    required_files = required_files or BACKUP_REQUIRED_FILES
    upload_size = getattr(uploaded_file, "size", None)
    if upload_size and upload_size > MAX_BACKUP_UPLOAD_BYTES:
        raise serializers.ValidationError("Backup ZIP is too large.")

    try:
        archive = ZipFile(uploaded_file)
    except BadZipFile as exc:
        raise serializers.ValidationError("Upload a valid Giztrack backup ZIP file.") from exc

    members = archive.infolist()
    if len(members) > MAX_BACKUP_ZIP_MEMBERS:
        archive.close()
        raise serializers.ValidationError("Backup ZIP contains too many files.")

    total_uncompressed_size = sum(member.file_size for member in members)
    if total_uncompressed_size > MAX_BACKUP_UNCOMPRESSED_BYTES:
        archive.close()
        raise serializers.ValidationError("Backup ZIP expands to too much data.")

    file_map = {}
    for member in archive.namelist():
        file_name = member.split("/")[-1]
        if not member or member.endswith("/") or file_name not in ALLOWED_BACKUP_FILENAMES:
            continue
        if file_name in file_map:
            archive.close()
            raise serializers.ValidationError(f"Backup ZIP contains duplicate {file_name} files.")
        file_map[file_name] = member

    missing_files = [name for name, _label in required_files if name not in file_map]
    if missing_files:
        raise serializers.ValidationError(
            f"Backup ZIP is missing required file(s): {', '.join(missing_files)}."
        )

    datasets = {}
    for file_name, label in BACKUP_PREVIEW_FILES:
        if file_name not in file_map:
            continue
        with archive.open(file_map[file_name]) as zipped_file:
            wrapper = TextIOWrapper(zipped_file, encoding="utf-8-sig", newline="")
            reader = csv.DictReader(wrapper)
            rows = []
            try:
                for row_number, row in enumerate(reader, start=1):
                    if row_number > MAX_BACKUP_CSV_ROWS:
                        raise serializers.ValidationError(
                            f"{file_name} contains too many rows."
                        )
                    rows.append(row)
            except serializers.ValidationError:
                archive.close()
                raise
            datasets[file_name] = {
                "label": label,
                "headers": reader.fieldnames or [],
                "rows": rows,
            }

    archive.close()
    return {
        "filename": getattr(uploaded_file, "name", "backup.zip"),
        "datasets": datasets,
        "missing_optional_files": [
            file_name
            for file_name, _label in BACKUP_OPTIONAL_FILES
            if file_name not in datasets
        ],
    }


def parse_backup_zip_preview(uploaded_file):
    backup = read_backup_zip(uploaded_file)
    datasets = backup["datasets"]

    summary_details = {}

    preview_datasets = []
    for file_name, label in BACKUP_PREVIEW_FILES:
        if file_name not in datasets:
            continue
        rows = datasets[file_name]["rows"]
        preview_datasets.append(
            {
                "key": file_name.replace(".csv", ""),
                "label": label,
                "file_name": file_name,
                "headers": datasets[file_name]["headers"],
                "row_count": len(rows),
                "preview_rows": rows[:5],
            }
        )

        if file_name == "summary.csv":
            summary_details = {
                row.get("Metric", ""): row.get("Value", "")
                for row in rows
                if row.get("Metric")
            }

    return {
        "filename": backup["filename"],
        "shop_name": summary_details.get("Shop Name", ""),
        "generated_at": summary_details.get("Generated At", ""),
        "datasets": preview_datasets,
        "totals": {
            dataset["key"]: dataset["row_count"]
            for dataset in preview_datasets
            if dataset["key"] != "summary"
        },
        "missing_optional_files": backup["missing_optional_files"],
    }


def apply_model_timestamps(model_class, instance_id, created_at=None, updated_at=None):
    updates = {}
    if created_at and hasattr(model_class, "created_at"):
        updates["created_at"] = created_at
    if updated_at and hasattr(model_class, "updated_at"):
        updates["updated_at"] = updated_at
    if updates:
        model_class.objects.filter(pk=instance_id).update(**updates)


def restore_shop_from_backup(shop, datasets):
    categories_rows = datasets.get("categories.csv", {}).get("rows", [])
    products_rows = datasets.get("products.csv", {}).get("rows", [])
    customers_rows = datasets.get("customers.csv", {}).get("rows", [])
    sales_rows = datasets.get("sales.csv", {}).get("rows", [])
    sale_items_rows = datasets.get("sale_items.csv", {}).get("rows", [])
    payments_rows = datasets.get("payments.csv", {}).get("rows", [])
    expenses_rows = datasets.get("expenses.csv", {}).get("rows", [])
    repairs_rows = datasets.get("repairs.csv", {}).get("rows", [])
    repair_parts_rows = datasets.get("repair_parts.csv", {}).get("rows", [])
    stock_logs_rows = datasets.get("stock_logs.csv", {}).get("rows", [])

    staff_by_email = {
        user.email.lower(): user
        for user in CustomUser.objects.filter(shop=shop)
    }

    category_map = {}
    customer_map = {}
    product_map = {}
    sale_map = {}
    repair_map = {}

    inferred_category_names = [
        clean_text(row.get("Category"))
        for row in products_rows
        if clean_text(row.get("Category")) and clean_text(row.get("Category")) != "Uncategorised"
    ]

    with transaction.atomic():
        Sale.objects.filter(shop=shop).delete()
        RepairTicket.objects.filter(shop=shop).delete()
        Product.objects.filter(shop=shop).delete()
        Expense.objects.filter(shop=shop).delete()
        Customer.objects.filter(shop=shop).delete()
        Category.objects.filter(shop=shop).delete()

        created_category_names = set()
        for row in categories_rows:
            name = clean_text(row.get("Name"))
            if not name or name in created_category_names:
                continue
            category = Category.objects.create(shop=shop, name=name)
            created_category_names.add(name)
            category_map[name] = category
            timestamp = parse_datetime_value(row.get("Created"))
            apply_model_timestamps(Category, category.id, created_at=timestamp)

        for name in inferred_category_names:
            if name in created_category_names:
                continue
            category = Category.objects.create(shop=shop, name=name)
            created_category_names.add(name)
            category_map[name] = category

        for row in customers_rows:
            phone = clean_text(row.get("Phone"))
            if not phone:
                continue
            customer = Customer.objects.create(
                shop=shop,
                name=clean_text(row.get("Name")) or phone,
                phone=phone,
                email=clean_text(row.get("Email")),
                address=clean_text(row.get("Address")),
            )
            customer_map[phone] = customer
            created_at = parse_datetime_value(row.get("Created"))
            updated_at = parse_datetime_value(row.get("Updated"))
            apply_model_timestamps(Customer, customer.id, created_at=created_at, updated_at=updated_at)

        for row in products_rows:
            category_name = clean_text(row.get("Category"))
            category = None
            if category_name and category_name != "Uncategorised":
                category = category_map.get(category_name)
                if category is None:
                    category = Category.objects.create(shop=shop, name=category_name)
                    category_map[category_name] = category

            product = Product.objects.create(
                shop=shop,
                category=category,
                name=clean_text(row.get("Name")) or "Unnamed Product",
                description=clean_text(row.get("Description")),
                cost_price=parse_decimal_value(row.get("Cost Price")),
                selling_price=parse_decimal_value(row.get("Selling Price")),
                brand=clean_text(row.get("Brand")) or None,
                product_model=clean_text(row.get("Model")) or None,
                color=clean_text(row.get("Color")) or None,
                quantity=parse_int_value(row.get("Quantity")),
                low_stock_threshold=parse_int_value(row.get("Low Stock Threshold"), default=5),
                sku=clean_text(row.get("SKU")),
                is_active=parse_bool_value(row.get("Active") or "Yes"),
            )
            product_map[product_lookup_key(row.get("SKU"), row.get("Name"))] = product
            created_at = parse_datetime_value(row.get("Created"))
            updated_at = parse_datetime_value(row.get("Updated"))
            apply_model_timestamps(Product, product.id, created_at=created_at, updated_at=updated_at)

        for row in sales_rows:
            legacy_sale_id = clean_text(row.get("Sale ID"))
            staff = staff_by_email.get(clean_text(row.get("Staff Email")).lower())
            customer = customer_map.get(clean_text(row.get("Customer Phone")))
            sale = Sale.objects.create(
                shop=shop,
                customer=customer,
                staff=staff,
                total_amount=parse_decimal_value(row.get("Total Amount")),
                total_profit=parse_decimal_value(row.get("Total Profit")),
                discount_amount=parse_decimal_value(row.get("Discount Amount")),
                amount_paid=parse_decimal_value(row.get("Amount Paid")),
                is_credit=parse_bool_value(row.get("Credit Sale")),
                note=clean_text(row.get("Note")),
            )
            if legacy_sale_id:
                sale_map[legacy_sale_id] = sale
            created_at = parse_datetime_value(row.get("Created"))
            apply_model_timestamps(Sale, sale.id, created_at=created_at)

        for row in sale_items_rows:
            sale = sale_map.get(clean_text(row.get("Sale ID")))
            if sale is None:
                continue
            product = product_map.get(product_lookup_key(row.get("Product SKU"), row.get("Product Name")))
            SaleItem.objects.create(
                sale=sale,
                product=product,
                product_name=clean_text(row.get("Product Name")) or "Custom Item",
                quantity=parse_int_value(row.get("Quantity"), default=1),
                unit_price=parse_decimal_value(row.get("Unit Price")),
                unit_cost=parse_decimal_value(row.get("Unit Cost")),
                is_custom=parse_bool_value(row.get("Custom Item")),
                returned_quantity=parse_int_value(row.get("Returned Quantity")),
            )

        for row in payments_rows:
            sale = sale_map.get(clean_text(row.get("Sale ID")))
            if sale is None:
                continue
            SalePayment.objects.create(
                sale=sale,
                amount=parse_decimal_value(row.get("Amount")),
                note=clean_text(row.get("Note")),
                received_by=staff_by_email.get(clean_text(row.get("Received By Email")).lower()),
                created_at=parse_datetime_value(row.get("Created")) or timezone.now(),
            )

        valid_expense_categories = {choice[0] for choice in Expense.Category.choices}
        for row in expenses_rows:
            category = clean_text(row.get("Category")).lower()
            Expense.objects.create(
                shop=shop,
                amount=parse_decimal_value(row.get("Amount")),
                category=category if category in valid_expense_categories else Expense.Category.MISCELLANEOUS,
                description=clean_text(row.get("Description")),
                date=parse_date_value(row.get("Date")) or timezone.localdate(),
                logged_by=staff_by_email.get(clean_text(row.get("Logged By Email")).lower()),
            )

        valid_repair_statuses = {choice[0] for choice in RepairTicket.Status.choices}
        for row in repairs_rows:
            legacy_repair_id = clean_text(row.get("Repair ID"))
            status_value = clean_text(row.get("Status")).lower().replace(" ", "_")
            repair = RepairTicket.objects.create(
                shop=shop,
                customer=customer_map.get(clean_text(row.get("Customer Phone"))),
                technician=staff_by_email.get(clean_text(row.get("Technician Email")).lower()),
                device_type=clean_text(row.get("Device Type")) or "Unknown Device",
                device_model=clean_text(row.get("Device Model")) or "Unknown Model",
                issue_description=clean_text(row.get("Issue Description")) or "Restored from backup",
                estimated_cost=parse_decimal_value(row.get("Estimated Cost")),
                final_cost=parse_decimal_value(row.get("Final Cost")) if clean_text(row.get("Final Cost")) else None,
                amount_paid=parse_decimal_value(row.get("Amount Paid")),
                status=status_value if status_value in valid_repair_statuses else RepairTicket.Status.RECEIVED,
                note=clean_text(row.get("Note")),
            )
            if legacy_repair_id:
                repair_map[legacy_repair_id] = repair
            created_at = parse_datetime_value(row.get("Created"))
            updated_at = parse_datetime_value(row.get("Updated"))
            apply_model_timestamps(RepairTicket, repair.id, created_at=created_at, updated_at=updated_at)

        for row in repair_parts_rows:
            repair = repair_map.get(clean_text(row.get("Repair ID")))
            if repair is None:
                continue
            part = RepairPart.objects.create(
                ticket=repair,
                product=product_map.get(product_lookup_key(row.get("Product SKU"), row.get("Product Name"))),
                product_name=clean_text(row.get("Product Name")) or "Unknown Part",
                quantity_used=parse_int_value(row.get("Quantity Used"), default=1),
                unit_cost=parse_decimal_value(row.get("Unit Cost")),
            )
            apply_model_timestamps(
                RepairPart,
                part.id,
                created_at=parse_datetime_value(row.get("Created")),
            )

        valid_stock_reasons = {choice[0] for choice in StockLog.Reason.choices}
        for row in stock_logs_rows:
            product = product_map.get(product_lookup_key(row.get("Product SKU"), row.get("Product Name")))
            reason = clean_text(row.get("Reason")).lower()
            if product is None or reason not in valid_stock_reasons:
                continue
            log = StockLog.objects.create(
                product=product,
                change_amount=parse_int_value(row.get("Change Amount")),
                quantity_after=parse_int_value(row.get("Quantity After")),
                reason=reason,
                note=clean_text(row.get("Note")),
                created_by=staff_by_email.get(clean_text(row.get("Created By Email")).lower()),
            )
            apply_model_timestamps(
                StockLog,
                log.id,
                created_at=parse_datetime_value(row.get("Created")),
            )

    return {
        "categories": len(categories_rows) or len(category_map),
        "products": len(products_rows),
        "customers": len(customers_rows),
        "sales": len(sales_rows),
        "sale_items": len(sale_items_rows),
        "payments": len(payments_rows),
        "expenses": len(expenses_rows),
        "repairs": len(repairs_rows),
        "repair_parts": len(repair_parts_rows),
        "stock_logs": len(stock_logs_rows),
    }


def build_shop_backup_zip_response(filename, payload):
    shop = payload["shop"]
    generated_at = format_datetime(payload["generated_at"])

    files = {
        "summary.csv": render_csv_table(
            ["Metric", "Value"],
            [
                ["Shop Name", shop.name],
                ["Generated At", generated_at],
                ["Categories", payload["summary"]["categories"]],
                ["Products", payload["summary"]["products"]],
                ["Customers", payload["summary"]["customers"]],
                ["Sales", payload["summary"]["sales"]],
                ["Sale Items", payload["summary"]["sale_items"]],
                ["Payments", payload["summary"]["payments"]],
                ["Expenses", payload["summary"]["expenses"]],
                ["Repairs", payload["summary"]["repairs"]],
                ["Repair Parts", payload["summary"]["repair_parts"]],
                ["Stock Logs", payload["summary"]["stock_logs"]],
            ],
        ),
        "categories.csv": render_csv_table(
            ["Name", "Created"],
            [
                [
                    category.name,
                    format_datetime(category.created_at),
                ]
                for category in payload["categories"]
            ],
        ),
        "products.csv": render_csv_table(
            ["Name", "Category", "SKU", "Brand", "Model", "Color", "Description", "Cost Price", "Selling Price", "Quantity", "Low Stock Threshold", "Active", "Created", "Updated"],
            [
                [
                    product.name,
                    product.category.name if product.category else "Uncategorised",
                    product.sku or "",
                    product.brand or "",
                    product.product_model or "",
                    product.color or "",
                    product.description or "",
                    format_money(product.cost_price),
                    format_money(product.selling_price),
                    product.quantity,
                    product.low_stock_threshold,
                    "Yes" if product.is_active else "No",
                    format_datetime(product.created_at),
                    format_datetime(product.updated_at),
                ]
                for product in payload["products"]
            ],
        ),
        "customers.csv": render_csv_table(
            ["Name", "Phone", "Email", "Address", "Created", "Updated"],
            [
                [
                    customer.name,
                    customer.phone or "",
                    customer.email or "",
                    customer.address or "",
                    format_datetime(customer.created_at),
                    format_datetime(customer.updated_at),
                ]
                for customer in payload["customers"]
            ],
        ),
        "sales.csv": render_csv_table(
            ["Sale ID", "Customer Phone", "Customer Name", "Staff Email", "Total Amount", "Total Profit", "Discount Amount", "Amount Paid", "Balance Owed", "Credit Sale", "Note", "Created"],
            [
                [
                    sale.id,
                    sale.customer.phone if sale.customer else "",
                    sale.customer.name if sale.customer else "Walk-in Customer",
                    sale.staff.email if sale.staff else "",
                    format_money(sale.total_amount),
                    format_money(sale.total_profit),
                    format_money(sale.discount_amount),
                    format_money(sale.amount_paid),
                    format_money(sale.balance_owed),
                    "Yes" if sale.is_credit else "No",
                    sale.note or "",
                    format_datetime(sale.created_at),
                ]
                for sale in payload["sales"]
            ],
        ),
        "sale_items.csv": render_csv_table(
            ["Sale ID", "Product SKU", "Product Name", "Quantity", "Unit Price", "Unit Cost", "Custom Item", "Returned Quantity"],
            [
                [
                    item.sale_id,
                    item.product.sku if item.product else "",
                    item.product_name,
                    item.quantity,
                    format_money(item.unit_price),
                    format_money(item.unit_cost),
                    "Yes" if item.is_custom else "No",
                    item.returned_quantity,
                ]
                for item in payload["sale_items"]
            ],
        ),
        "payments.csv": render_csv_table(
            ["Sale ID", "Amount", "Received By Email", "Note", "Created"],
            [
                [
                    payment.sale_id,
                    format_money(payment.amount),
                    payment.received_by.email if payment.received_by else "",
                    payment.note or "",
                    format_datetime(payment.created_at),
                ]
                for payment in payload["payments"]
            ],
        ),
        "expenses.csv": render_csv_table(
            ["Amount", "Category", "Description", "Date", "Logged By Email"],
            [
                [
                    format_money(expense.amount),
                    expense.category,
                    expense.description,
                    format_date(expense.date),
                    expense.logged_by.email if expense.logged_by else "",
                ]
                for expense in payload["expenses"]
            ],
        ),
        "repairs.csv": render_csv_table(
            ["Repair ID", "Customer Phone", "Customer Name", "Technician Email", "Device Type", "Device Model", "Issue Description", "Status", "Estimated Cost", "Final Cost", "Amount Paid", "Note", "Created", "Updated"],
            [
                [
                    repair.id,
                    repair.customer.phone if repair.customer else "",
                    repair.customer.name if repair.customer else "",
                    repair.technician.email if repair.technician else "",
                    repair.device_type,
                    repair.device_model,
                    repair.issue_description,
                    repair.status,
                    format_money(repair.estimated_cost),
                    format_money(repair.final_cost),
                    format_money(repair.amount_paid),
                    repair.note or "",
                    format_datetime(repair.created_at),
                    format_datetime(repair.updated_at),
                ]
                for repair in payload["repairs"]
            ],
        ),
        "repair_parts.csv": render_csv_table(
            ["Repair ID", "Product SKU", "Product Name", "Quantity Used", "Unit Cost", "Created"],
            [
                [
                    part.ticket_id,
                    part.product.sku if part.product else "",
                    part.product_name,
                    part.quantity_used,
                    format_money(part.unit_cost),
                    format_datetime(part.created_at),
                ]
                for part in payload["repair_parts"]
            ],
        ),
        "stock_logs.csv": render_csv_table(
            ["Product SKU", "Product Name", "Change Amount", "Quantity After", "Reason", "Note", "Created By Email", "Created"],
            [
                [
                    log.product.sku or "",
                    log.product.name,
                    log.change_amount,
                    log.quantity_after,
                    log.reason,
                    log.note or "",
                    log.created_by.email if log.created_by else "",
                    format_datetime(log.created_at),
                ]
                for log in payload["stock_logs"]
            ],
        ),
    }

    readme_lines = [
        "Giztrack Shop Backup",
        f"Shop: {shop.name}",
        f"Generated At: {generated_at}",
        "",
        "This ZIP contains separate CSV files for categories, products, customers, sales, sale items, payments, expenses, repairs, repair parts, and stock logs.",
        "Use Preview Backup Before Import before applying a restore.",
        "Restoring a backup should replace current business data for the shop, not append to it.",
    ]

    buffer = BytesIO()
    with ZipFile(buffer, "w", compression=ZIP_DEFLATED) as archive:
        archive.writestr("README.txt", "\n".join(readme_lines))
        for file_name, file_content in files.items():
            archive.writestr(file_name, file_content)

    response = HttpResponse(buffer.getvalue(), content_type="application/zip")
    response["Content-Disposition"] = f'attachment; filename="{filename}"'
    return response


def get_report_export_payload(shop, period, date_from, date_to):
    sales_qs = Sale.objects.filter(
        shop=shop,
        created_at__date__gte=date_from,
        created_at__date__lte=date_to,
    )
    expenses_qs = Expense.objects.filter(
        shop=shop,
        date__gte=date_from,
        date__lte=date_to,
    )

    totals = sales_qs.aggregate(
        total_revenue=Sum("total_amount"),
        total_profit=Sum("total_profit"),
        total_sales=Count("id"),
    )
    total_expenses = expenses_qs.aggregate(total=Sum("amount"))["total"] or Decimal("0.00")

    trunc_map = {
        "daily": TruncDay,
        "weekly": TruncWeek,
        "monthly": TruncMonth,
    }
    trunc_fn = trunc_map.get(period, TruncDay)

    sales_breakdown = (
        sales_qs.annotate(period_bucket=trunc_fn("created_at"))
        .values("period_bucket")
        .annotate(
            revenue=Sum("total_amount"),
            gross_profit=Sum("total_profit"),
            sale_count=Count("id"),
        )
        .order_by("period_bucket")
    )
    expense_breakdown = (
        expenses_qs.annotate(period_bucket=trunc_fn("date"))
        .values("period_bucket")
        .annotate(expenses=Sum("amount"))
        .order_by("period_bucket")
    )

    merged = {}
    current_date = date_from
    while current_date <= date_to:
        if period == "monthly":
            bucket = current_date.replace(day=1)
            next_date = (bucket + timedelta(days=32)).replace(day=1)
        elif period == "weekly":
            bucket = current_date - timedelta(days=current_date.weekday())
            next_date = bucket + timedelta(days=7)
        else:
            bucket = current_date
            next_date = current_date + timedelta(days=1)

        key = bucket.isoformat()
        if key not in merged:
            merged[key] = {
                "period": key,
                "revenue": Decimal("0.00"),
                "gross_profit": Decimal("0.00"),
                "expenses": Decimal("0.00"),
                "sale_count": 0,
            }
        current_date = next_date

    for entry in sales_breakdown:
        bucket = entry["period_bucket"]
        if hasattr(bucket, "date"):
            bucket = bucket.date()
        key = bucket.isoformat()
        if key in merged:
            merged[key]["revenue"] = entry["revenue"] or Decimal("0.00")
            merged[key]["gross_profit"] = entry["gross_profit"] or Decimal("0.00")
            merged[key]["sale_count"] = entry["sale_count"] or 0

    for entry in expense_breakdown:
        bucket = entry["period_bucket"]
        if hasattr(bucket, "date"):
            bucket = bucket.date()
        key = bucket.isoformat()
        if key in merged:
            merged[key]["expenses"] = entry["expenses"] or Decimal("0.00")

    breakdown = []
    for row in merged.values():
        row["net_profit"] = row["gross_profit"] - row["expenses"]
        breakdown.append(row)
    breakdown.sort(key=lambda item: item["period"])

    best_sellers = list(
        SaleItem.objects.filter(
            sale__shop=shop,
            sale__created_at__date__gte=date_from,
            sale__created_at__date__lte=date_to,
        )
        .values("product_name")
        .annotate(
            total_qty=Sum("quantity"),
            total_revenue=Sum(
                F("quantity") * F("unit_price"),
                output_field=DecimalField(max_digits=12, decimal_places=2),
            ),
            total_profit=Sum(
                F("quantity") * (F("unit_price") - F("unit_cost")),
                output_field=DecimalField(max_digits=12, decimal_places=2),
            ),
        )
        .order_by("-total_revenue", "product_name")[:10]
    )

    technician_rows = list(
        RepairTicket.objects.filter(
            shop=shop,
            technician__isnull=False,
            created_at__date__gte=date_from,
            created_at__date__lte=date_to,
        )
        .values("technician__first_name", "technician__last_name")
        .annotate(
            total_assigned=Count("id"),
            total_completed=Count("id", filter=Q(status=RepairTicket.Status.COLLECTED)),
            total_revenue=Sum("amount_paid"),
        )
        .order_by("-total_completed", "-total_revenue")
    )

    low_stock_rows = list(
        Product.objects.filter(
            shop=shop,
            is_active=True,
            quantity__lte=F("low_stock_threshold"),
        )
        .select_related("category")
        .order_by("quantity", "name")
    )

    outstanding_expr = F("total_amount") - F("amount_paid")
    credit_qs = Sale.objects.filter(
        shop=shop,
        is_credit=True,
        customer__isnull=False,
        created_at__date__gte=date_from,
        created_at__date__lte=date_to,
        total_amount__gt=F("amount_paid"),
    )
    credit_summary = credit_qs.aggregate(
        customers_with_balance=Count("customer", distinct=True),
        total_credit_sales=Count("id"),
        total_outstanding=Sum(
            outstanding_expr,
            output_field=DecimalField(max_digits=12, decimal_places=2),
        ),
    )
    credit_customers = list(
        credit_qs.values("customer__name", "customer__phone", "customer__email")
        .annotate(
            credit_sales_count=Count("id"),
            total_credit_amount=Sum("total_amount"),
            total_paid=Sum("amount_paid"),
            total_owed=Sum(
                outstanding_expr,
                output_field=DecimalField(max_digits=12, decimal_places=2),
            ),
            last_credit_sale_at=Max("created_at"),
        )
        .order_by("-total_owed", "customer__name")
    )

    repair_status_rows = list(
        RepairTicket.objects.filter(
            shop=shop,
            created_at__date__gte=date_from,
            created_at__date__lte=date_to,
        )
        .values("status")
        .annotate(count=Count("id"))
        .order_by("-count", "status")
    )

    return {
        "period": period,
        "from": date_from,
        "to": date_to,
        "summary": {
            "total_revenue": totals["total_revenue"] or Decimal("0.00"),
            "total_gross_profit": totals["total_profit"] or Decimal("0.00"),
            "total_expenses": total_expenses,
            "total_net_profit": (totals["total_profit"] or Decimal("0.00")) - total_expenses,
            "total_sales": totals["total_sales"] or 0,
        },
        "breakdown": breakdown,
        "best_sellers": best_sellers,
        "technicians": technician_rows,
        "low_stock": low_stock_rows,
        "credit_summary": {
            "customers_with_balance": credit_summary["customers_with_balance"] or 0,
            "total_credit_sales": credit_summary["total_credit_sales"] or 0,
            "total_outstanding": credit_summary["total_outstanding"] or Decimal("0.00"),
        },
        "credit_customers": credit_customers,
        "repair_statuses": repair_status_rows,
    }


def get_shop_backup_payload(shop):
    categories = list(Category.objects.filter(shop=shop).order_by("name"))
    products = list(
        Product.objects.filter(shop=shop)
        .select_related("category")
        .order_by("name")
    )
    customers = list(Customer.objects.filter(shop=shop).order_by("name"))
    sales = list(
        Sale.objects.filter(shop=shop)
        .select_related("customer", "staff")
        .order_by("-created_at")
    )
    sale_items = list(
        SaleItem.objects.filter(sale__shop=shop)
        .select_related("sale", "product")
        .order_by("sale_id", "id")
    )
    payments = list(
        SalePayment.objects.filter(sale__shop=shop)
        .select_related("sale", "received_by")
        .order_by("-created_at")
    )
    expenses = list(
        Expense.objects.filter(shop=shop)
        .select_related("logged_by")
        .order_by("-date", "-created_at")
    )
    repairs = list(
        RepairTicket.objects.filter(shop=shop)
        .select_related("customer", "technician")
        .order_by("-created_at")
    )
    repair_parts = list(
        RepairPart.objects.filter(ticket__shop=shop)
        .select_related("ticket", "product")
        .order_by("ticket_id", "id")
    )
    stock_logs = list(
        StockLog.objects.filter(product__shop=shop)
        .select_related("product", "created_by")
        .order_by("product_id", "created_at", "id")
    )

    return {
        "generated_at": timezone.now(),
        "shop": shop,
        "categories": categories,
        "products": products,
        "customers": customers,
        "sales": sales,
        "sale_items": sale_items,
        "payments": payments,
        "expenses": expenses,
        "repairs": repairs,
        "repair_parts": repair_parts,
        "stock_logs": stock_logs,
        "summary": {
            "categories": len(categories),
            "products": len(products),
            "customers": len(customers),
            "sales": len(sales),
            "sale_items": len(sale_items),
            "payments": len(payments),
            "expenses": len(expenses),
            "repairs": len(repairs),
            "repair_parts": len(repair_parts),
            "stock_logs": len(stock_logs),
        },
    }


class SalesReportQuerySerializer(serializers.Serializer):
    period = serializers.ChoiceField(choices=["daily", "weekly", "monthly"], required=False, default="daily")
    from_date = serializers.DateField(required=False)
    to_date = serializers.DateField(required=False)


def build_report_query_data(request):
    data = {
        "period": request.query_params.get("period", "daily"),
    }
    if request.query_params.get("from") is not None:
        data["from_date"] = request.query_params.get("from")
    if request.query_params.get("to") is not None:
        data["to_date"] = request.query_params.get("to")
    return data


class DashboardView(APIView):
    """
    GET /api/v1/reports/dashboard/
    Quick stats for the dashboard widgets — always scoped to today.
    Accessible by all authenticated users (admin, staff, technician).
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        shop = request.user.shop
        today = timezone.localdate()

        # ── Inventory ────────────────────────────────────────────────
        total_products = Product.objects.filter(shop=shop, is_active=True).count()
        low_stock_count = Product.objects.filter(
            shop=shop, is_active=True, quantity__lte=F("low_stock_threshold")
        ).count()

        # ── Today's Sales ────────────────────────────────────────────
        todays_sales = Sale.objects.filter(shop=shop, created_at__date=today)
        todays_sales_value = todays_sales.aggregate(
            total=Sum("total_amount")
        )["total"]
        todays_sales_value = decimal_money(todays_sales_value)
        todays_sale_count = todays_sales.count()

        todays_payments = SalePayment.objects.filter(
            sale__shop=shop,
            created_at__date=today,
        ).select_related("sale")
        todays_cash_received = todays_payments.aggregate(
            total=Sum("amount")
        )["total"]
        todays_cash_received = decimal_money(todays_cash_received)
        todays_collection_count = todays_payments.filter(amount__gt=0).count()

        todays_realized_profit = Decimal("0.00")
        for payment in todays_payments:
            if payment.sale.total_amount <= 0:
                continue
            todays_realized_profit += (
                payment.sale.total_profit * payment.amount
            ) / payment.sale.total_amount
        todays_realized_profit = todays_realized_profit.quantize(Decimal("0.01"))

        # ── Today's Expenses ─────────────────────────────────────────
        todays_expenses = Expense.objects.filter(shop=shop, date=today).aggregate(
            total=Sum("amount")
        )["total"]
        todays_expenses = decimal_money(todays_expenses)

        # Net Profit = Realized profit from collected payments - expenses
        todays_profit_net = (todays_realized_profit - todays_expenses).quantize(Decimal("0.01"))

        # ── All-time Revenue & Profit ────────────────────────────────
        total_revenue = Sale.objects.filter(shop=shop).aggregate(
            total=Sum("total_amount")
        )["total"]
        total_revenue = decimal_money(total_revenue)

        credit_totals = Sale.objects.filter(
            shop=shop,
            is_credit=True,
            total_amount__gt=F("amount_paid"),
        ).aggregate(
            outstanding=Sum(
                F("total_amount") - F("amount_paid"),
                output_field=DecimalField(max_digits=12, decimal_places=2),
            ),
            customers_with_balance=Count(
                "customer",
                filter=Q(customer__isnull=False),
                distinct=True,
            ),
            sales_with_balance=Count("id"),
        )

        # ── Repairs ──────────────────────────────────────────────────
        active_repairs = RepairTicket.objects.filter(
            shop=shop
        ).exclude(
            status__in=[RepairTicket.Status.COLLECTED]
        ).count()

        completed_today = RepairTicket.objects.filter(
            shop=shop,
            status=RepairTicket.Status.COLLECTED,
            updated_at__date=today,
        ).count()

        repairs_by_status = RepairTicket.objects.filter(shop=shop).values(
            "status"
        ).annotate(count=Count("id"))

        return Response({
            "inventory": {
                "total_products": total_products,
                "low_stock_count": low_stock_count,
            },
            "sales_today": {
                "count": todays_sale_count,
                "payment_count": todays_collection_count,
                "sales_value": todays_sales_value,
                "cash_received": todays_cash_received,
                "revenue": todays_cash_received,
                "profit": todays_profit_net,
            },
            "credit": {
                "outstanding": decimal_money(credit_totals["outstanding"]),
                "customers_with_balance": credit_totals["customers_with_balance"] or 0,
                "sales_with_balance": credit_totals["sales_with_balance"] or 0,
            },
            "revenue_all_time": total_revenue,
            "repairs": {
                "active": active_repairs,
                "completed_today": completed_today,
                "by_status": {r["status"]: r["count"] for r in repairs_by_status},
            },
        })


class SalesReportView(APIView):
    """
    GET /api/v1/reports/sales/?period=daily|weekly|monthly&from=YYYY-MM-DD&to=YYYY-MM-DD
    Revenue and profit grouped by period.
    """
    permission_classes = [IsAuthenticated, IsAdminOrStaff, IsProPlan]

    def get(self, request):
        filters = SalesReportQuerySerializer(
            data=build_report_query_data(request)
        )
        filters.is_valid(raise_exception=True)

        shop = request.user.shop
        period = filters.validated_data["period"]
        date_from = filters.validated_data.get("from_date")
        date_to = filters.validated_data.get("to_date")

        # Default: last 30 days
        if not date_from:
            date_from = (timezone.now() - timedelta(days=30)).date()
        if not date_to:
            date_to = timezone.now().date()

        qs = Sale.objects.filter(
            shop=shop,
            created_at__date__gte=date_from,
            created_at__date__lte=date_to,
        )

        totals = qs.aggregate(
            total_revenue=Sum("total_amount"),
            total_profit=Sum("total_profit"),
            total_sales=Count("id")
        )

        # Group by period
        trunc_map = {
            "daily": TruncDay,
            "weekly": TruncWeek,
            "monthly": TruncMonth,
        }
        trunc_fn = trunc_map.get(period, TruncDay)

        data = (
            qs.annotate(period=trunc_fn("created_at"))
            .values("period")
            .annotate(
                revenue=Sum("total_amount"),
                profit=Sum("total_profit"),
                sale_count=Count("id"),
            )
            .order_by("period")
        )

        # Gather Expenses over the same period
        expenses_qs = Expense.objects.filter(
            shop=shop,
            date__gte=date_from,
            date__lte=date_to,
        )

        expenses_data = (
            expenses_qs.annotate(period=trunc_fn("date"))
            .values("period")
            .annotate(total_expenses=Sum("amount"))
            .order_by("period")
        )

        # Generate contiguous periods
        merged_dict = {}
        current_date = date_from
        while current_date <= date_to:
            if period == 'monthly':
                p_date = current_date.replace(day=1)
                next_date = (p_date + timedelta(days=32)).replace(day=1)
            elif period == 'weekly':
                p_date = current_date - timedelta(days=current_date.weekday())
                next_date = p_date + timedelta(days=7)
            else:
                p_date = current_date
                next_date = current_date + timedelta(days=1)
            
            p_str = p_date.isoformat()
            if p_str not in merged_dict:
                merged_dict[p_str] = {
                    "period": p_str, "revenue": 0, "profit": 0, "sale_count": 0, "expenses": 0
                }
            current_date = next_date

        # Merge sales data
        for entry in data:
            p = entry["period"]
            if hasattr(p, 'date'):
                p = p.date()
            if hasattr(p, 'isoformat'):
                p_str = p.isoformat()
            else:
                p_str = str(p)
                
            if p_str in merged_dict:
                merged_dict[p_str]["revenue"] += entry["revenue"] or 0
                merged_dict[p_str]["profit"] += entry["profit"] or 0
                merged_dict[p_str]["sale_count"] += entry["sale_count"] or 0

        # Merge expenses
        for exp in expenses_data:
            p = exp["period"]
            if hasattr(p, 'date'):
                p = p.date()
            if hasattr(p, 'isoformat'):
                p_str = p.isoformat()
            else:
                p_str = str(p)
                
            if p_str in merged_dict:
                merged_dict[p_str]["expenses"] += exp["total_expenses"] or 0

        total_expenses = expenses_qs.aggregate(total=Sum("amount"))["total"] or 0

        # Calculate net profit for each period entry 
        breakdown = []
        for p, stats in sorted(merged_dict.items()):
            stats["net_profit"] = stats["profit"] - stats["expenses"]
            breakdown.append(stats)

        return Response({
            "period": period,
            "from": date_from,
            "to": date_to,
            "summary": {
                "total_revenue": totals["total_revenue"] or 0,
                "total_profit": totals["total_profit"] or 0, # gross
                "total_net_profit": (totals["total_profit"] or 0) - total_expenses,
                "total_expenses": total_expenses,
                "total_sales": totals["total_sales"] or 0,
            },
            "breakdown": breakdown,
        })


class BestSellingProductsView(APIView):
    """
    GET /api/v1/reports/products/best-selling/?limit=10
    Top products by total revenue generated.
    """
    permission_classes = [IsAuthenticated, IsAdminOrStaff, IsProPlan]

    def get(self, request):
        shop = request.user.shop
        try:
            limit = max(1, min(int(request.query_params.get("limit", 10)), 100))
        except (ValueError, TypeError):
            limit = 10
        date_from = request.query_params.get("from")
        date_to = request.query_params.get("to")

        qs = SaleItem.objects.filter(sale__shop=shop)

        if date_from:
            qs = qs.filter(sale__created_at__date__gte=date_from)
        if date_to:
            qs = qs.filter(sale__created_at__date__lte=date_to)

        data = (
            qs.values("product_name")
            .annotate(
                total_qty=Sum("quantity"),
                total_revenue=Sum(F("quantity") * F("unit_price"),
                                  output_field=DecimalField()),
                total_profit=Sum(
                    F("quantity") * (F("unit_price") - F("unit_cost")),
                    output_field=DecimalField(),
                ),
            )
            .order_by("-total_revenue")[:limit]
        )

        return Response({
            "results": list(data)
        })


class TechnicianReportView(APIView):
    """
    GET /api/v1/reports/technicians/
    Repair counts and revenue per technician.
    """
    permission_classes = [IsAuthenticated, IsAdminOrStaff, IsProPlan]

    def get(self, request):
        shop = request.user.shop
        date_from = request.query_params.get("from")
        date_to = request.query_params.get("to")

        qs = RepairTicket.objects.filter(shop=shop, technician__isnull=False)

        if date_from:
            qs = qs.filter(created_at__date__gte=date_from)
        if date_to:
            qs = qs.filter(created_at__date__lte=date_to)

        data = (
            qs.values(
                "technician__id",
                "technician__first_name",
                "technician__last_name",
            )
            .annotate(
                total_assigned=Count("id"),
                total_completed=Count(
                    "id", filter=Q(status=RepairTicket.Status.COLLECTED)
                ),
                total_revenue=Sum("amount_paid"),
            )
            .order_by("-total_completed")
        )

        return Response({
            "results": [
                {
                    "technician_id": row["technician__id"],
                    "name": f"{row['technician__first_name']} {row['technician__last_name']}",
                    "total_assigned": row["total_assigned"],
                    "total_completed": row["total_completed"],
                    "total_revenue": row["total_revenue"] or 0,
                }
                for row in data
            ]
        })


class LowStockReportView(APIView):
    """
    GET /api/v1/reports/inventory/low-stock/
    All products at or below their threshold — grouped by category.
    """
    permission_classes = [IsAuthenticated, IsAdminOrStaff, IsProPlan]

    def get(self, request):
        shop = request.user.shop

        products = (
            Product.objects.filter(
                shop=shop,
                is_active=True,
                quantity__lte=F("low_stock_threshold"),
            )
            .select_related("category")
            .order_by("quantity")
        )

        data = [
            {
                "id": p.id,
                "name": p.name,
                "category": p.category.name if p.category else "Uncategorised",
                "quantity": p.quantity,
                "low_stock_threshold": p.low_stock_threshold,
                "selling_price": p.selling_price,
            }
            for p in products
        ]

        return Response({
            "count": len(data),
            "results": data,
        })


class CreditCustomersReportView(APIView):
    """
    GET /api/v1/reports/customers/credit/?from=YYYY-MM-DD&to=YYYY-MM-DD
    Customers with outstanding credit balances in the selected date range.
    """
    permission_classes = [IsAuthenticated, IsAdminOrStaff, IsProPlan]

    def get(self, request):
        filters = SalesReportQuerySerializer(
            data=build_report_query_data(request)
        )
        filters.is_valid(raise_exception=True)

        shop = request.user.shop
        date_from = filters.validated_data.get("from_date")
        date_to = filters.validated_data.get("to_date")

        if not date_from:
            date_from = (timezone.now() - timedelta(days=30)).date()
        if not date_to:
            date_to = timezone.now().date()

        outstanding_expr = F("total_amount") - F("amount_paid")

        qs = Sale.objects.filter(
            shop=shop,
            is_credit=True,
            customer__isnull=False,
            created_at__date__gte=date_from,
            created_at__date__lte=date_to,
            total_amount__gt=F("amount_paid"),
        )

        data = (
            qs.values(
                "customer__id",
                "customer__name",
                "customer__phone",
                "customer__email",
            )
            .annotate(
                credit_sales_count=Count("id"),
                total_credit_amount=Sum("total_amount"),
                total_paid=Sum("amount_paid"),
                total_owed=Sum(
                    outstanding_expr,
                    output_field=DecimalField(max_digits=12, decimal_places=2),
                ),
                last_credit_sale_at=Max("created_at"),
            )
            .order_by("-total_owed", "customer__name")
        )

        summary = qs.aggregate(
            customers_with_balance=Count("customer", distinct=True),
            total_credit_sales=Count("id"),
            total_outstanding=Sum(
                outstanding_expr,
                output_field=DecimalField(max_digits=12, decimal_places=2),
            ),
        )

        return Response(
            {
                "from": date_from,
                "to": date_to,
                "summary": {
                    "customers_with_balance": summary["customers_with_balance"] or 0,
                    "total_credit_sales": summary["total_credit_sales"] or 0,
                    "total_outstanding": decimal_money(summary["total_outstanding"]),
                },
                "results": [
                    {
                        "customer_id": row["customer__id"],
                        "customer_name": row["customer__name"],
                        "phone": row["customer__phone"],
                        "email": row["customer__email"],
                        "credit_sales_count": row["credit_sales_count"],
                        "total_credit_amount": decimal_money(row["total_credit_amount"]),
                        "total_paid": decimal_money(row["total_paid"]),
                        "total_owed": decimal_money(row["total_owed"]),
                        "last_credit_sale_at": row["last_credit_sale_at"],
                    }
                    for row in data
                ],
            }
        )


class ExportAnalyticsReportView(APIView):
    permission_classes = [IsAuthenticated, IsAdminOrStaff, IsProPlan]

    def get(self, request):
        filters = SalesReportQuerySerializer(data=build_report_query_data(request))
        filters.is_valid(raise_exception=True)

        fmt = request.query_params.get("download_format", "csv").lower()
        shop = request.user.shop
        period = filters.validated_data["period"]
        date_from = filters.validated_data.get("from_date")
        date_to = filters.validated_data.get("to_date")

        if not date_from:
            date_from = (timezone.now() - timedelta(days=30)).date()
        if not date_to:
            date_to = timezone.now().date()

        payload = get_report_export_payload(shop, period, date_from, date_to)
        generated_at = timezone.now()
        sections = build_report_export_sections(payload)
        title = f"Giztrack Analytics Report - {shop.name}"
        subtitle_lines = [
            f"Generated At: {format_datetime(generated_at)}",
            f"Period: {period.capitalize()}",
            f"Date Range: {format_date(date_from)} to {format_date(date_to)}",
        ]

        if fmt == "csv":
            return build_csv_response(
                f"analytics_report_{generated_at.date()}.csv",
                title,
                subtitle_lines,
                sections,
            )

        if fmt == "pdf":
            return build_pdf_response(
                f"analytics_report_{generated_at.date()}.pdf",
                title,
                subtitle_lines,
                sections,
            )

        return Response({"error": "Invalid export format requested."}, status=400)


class ExportShopBackupView(APIView):
    permission_classes = [IsAuthenticated, IsAdmin, IsProPlan]

    def get(self, request):
        fmt = request.query_params.get("download_format", "zip").lower()
        shop = request.user.shop
        payload = get_shop_backup_payload(shop)
        generated_at = payload["generated_at"]

        if fmt == "zip":
            return build_shop_backup_zip_response(
                f"shop_backup_{generated_at.date()}.zip",
                payload,
            )

        if fmt == "pdf":
            return build_pdf_response(
                f"shop_backup_{generated_at.date()}.pdf",
                f"Giztrack Shop Backup - {shop.name}",
                [
                    f"Generated At: {format_datetime(generated_at)}",
                    "Use the ZIP backup for spreadsheet-ready files.",
                ],
                build_shop_backup_sections(payload),
            )

        return Response({"error": "Invalid export format requested."}, status=400)


class BackupImportPreviewView(APIView):
    permission_classes = [IsAuthenticated, IsAdmin, IsProPlan]
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request):
        uploaded_file = request.FILES.get("file")
        if not uploaded_file:
            raise serializers.ValidationError({"file": "Select a backup ZIP file to preview."})

        preview = parse_backup_zip_preview(uploaded_file)
        return Response(
            {
                "message": "Preview generated successfully. No data has been imported.",
                "confirmation_phrase": RESTORE_CONFIRMATION_PHRASE,
                **preview,
            }
        )


class BackupImportApplyView(APIView):
    permission_classes = [IsAuthenticated, IsAdmin, IsProPlan]
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request):
        uploaded_file = request.FILES.get("file")
        if not uploaded_file:
            raise serializers.ValidationError({"file": "Select a backup ZIP file to restore."})

        confirmation = clean_text(request.data.get("confirmation"))
        if normalize_restore_confirmation(confirmation) != normalize_restore_confirmation(RESTORE_CONFIRMATION_PHRASE):
            raise serializers.ValidationError(
                {"confirmation": f'Type "{RESTORE_CONFIRMATION_PHRASE}" to confirm this restore.'}
            )

        backup = read_backup_zip(uploaded_file)
        restored_counts = restore_shop_from_backup(request.user.shop, backup["datasets"])

        return Response(
            {
                "message": "Backup restored successfully. Users, subscriptions, and billing records were not changed.",
                "restored": restored_counts,
                "missing_optional_files": backup["missing_optional_files"],
            }
        )
