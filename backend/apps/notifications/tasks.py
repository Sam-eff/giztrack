from utils.email_utils import send_giztrack_email
from django.conf import settings
from django.db.models import F
from django.utils import timezone


def notify_repair_ready(ticket_id):
    """
    Sends an email + SMS to the customer when their repair is marked as Fixed.
    SMS is only sent if:
      - The shop currently has Pro access
      - enable_sms_notifications is True
      - The customer has a phone number
    """
    from apps.repairs.models import RepairTicket
    from .messages import repair_ready_subject, repair_ready_body

    ticket = RepairTicket.objects.select_related(
        "customer", "shop"
    ).get(id=ticket_id)

    # ── Email ─────────────────────────────────────────────────────────────
    if ticket.customer and ticket.customer.email:
        send_giztrack_email(
            subject=repair_ready_subject(),
            message=repair_ready_body(
                customer_name=ticket.customer.name,
                device_model=ticket.device_model,
                shop_name=ticket.shop.name,
                shop_phone=ticket.shop.phone,
            ),
            recipient_list=[ticket.customer.email],
            fail_silently=False,
        )

    # ── SMS (Pro access only) ─────────────────────────────────────────────
    if ticket.shop.enable_sms_notifications:
        if ticket.shop.has_pro_access and ticket.customer and ticket.customer.phone:
            notification_message = (
                f"Hello {ticket.customer.name},\n"
                f"Your {ticket.device_model} is ready for pickup at {ticket.shop.name}.\n"
                f"Call {ticket.shop.phone} for any questions."
            )

            from utils.sms import send_sms
            send_sms(
                to_number=ticket.customer.phone,
                message=notification_message,
            )

    return f"Repair notifications sent for ticket #{ticket_id}"


def notify_low_stock(product_id):
    """
    Sends a low stock alert to the shop owner.
    Triggered by the Product post_save signal in inventory/signals.py
    """
    from apps.inventory.models import Product
    from apps.accounts.models import CustomUser, Role
    from .messages import low_stock_subject, low_stock_body

    product = Product.objects.select_related("shop").get(id=product_id)
    shop = product.shop

    # Get the admin user's email
    admin = CustomUser.objects.filter(shop=shop, role=Role.ADMIN).first()
    if not admin or not admin.email:
        return f"Skipped — no admin email for shop {shop.name}"

    send_giztrack_email(
        subject=low_stock_subject(shop.name),
        message=low_stock_body(
            products=[{
                "name": product.name,
                "quantity": product.quantity,
                "threshold": product.low_stock_threshold,
            }],
            shop_name=shop.name,
        ),
        recipient_list=[admin.email],
        fail_silently=False,
    )
    return f"Low stock alert sent for product #{product_id}"


def notify_expiring_subscriptions():
    """
    Periodic task — runs daily.
    Sends renewal reminders to shops expiring in 3 or 7 days.
    """
    from apps.shops.models import Shop
    from apps.accounts.models import CustomUser, Role
    from .messages import subscription_expiry_subject, subscription_expiry_body

    now = timezone.now()
    warning_days = [3, 7]

    for days in warning_days:
        target_date = (now + timezone.timedelta(days=days)).date()

        expiring_shops = Shop.objects.filter(
            subscription_expires_at__date=target_date,
            is_active=True,
        )

        for shop in expiring_shops:
            admin = CustomUser.objects.filter(shop=shop, role=Role.ADMIN).first()
            if not admin or not admin.email:
                continue

            send_giztrack_email(
                subject=subscription_expiry_subject(),
                message=subscription_expiry_body(
                    shop_name=shop.name,
                    days_remaining=days,
                ),
                recipient_list=[admin.email],
                fail_silently=True,
            )

    return f"Expiry reminders sent for {warning_days}-day windows"


def send_daily_summary():
    """
    Periodic task — runs every morning.
    Sends each shop admin a summary of yesterday's sales and active repairs.
    """
    from apps.shops.models import Shop
    from apps.accounts.models import CustomUser, Role
    from apps.sales.models import Sale
    from apps.repairs.models import RepairTicket
    from django.db.models import Sum, Count

    yesterday = (timezone.now() - timezone.timedelta(days=1)).date()

    for shop in Shop.objects.filter(is_active=True):
        admin = CustomUser.objects.filter(shop=shop, role=Role.ADMIN).first()
        if not admin or not admin.email:
            continue

        sales = Sale.objects.filter(shop=shop, created_at__date=yesterday)
        totals = sales.aggregate(
            revenue=Sum("total_amount"),
            profit=Sum("total_profit"),
            count=Count("id"),
        )
        active_repairs = RepairTicket.objects.filter(shop=shop).exclude(
            status=RepairTicket.Status.COLLECTED
        ).count()

        message = f"""Good morning!

Here's your summary for {yesterday.strftime('%A, %d %B %Y')}:

Sales
  - Total transactions: {totals['count'] or 0}
  - Revenue: ₦{totals['revenue'] or 0:,.2f}
  - Profit: ₦{totals['profit'] or 0:,.2f}

Repairs
  - Active repairs: {active_repairs}

— Giztrack
"""
        send_giztrack_email(
            subject=f"Daily Summary — {yesterday.strftime('%d %b %Y')}",
            message=message,
            recipient_list=[admin.email],
            fail_silently=True,
        )

    return "Daily summaries sent"
