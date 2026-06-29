from django.contrib import admin
from .models import PaymentHistory, PaystackWebhookEvent, Plan, Subscription


@admin.register(Plan)
class PlanAdmin(admin.ModelAdmin):
    list_display = ["name", "price", "max_users", "max_products", "is_active"]
    list_filter = ["is_active"]


@admin.register(Subscription)
class SubscriptionAdmin(admin.ModelAdmin):
    list_display = ["shop", "plan", "status", "current_period_start", "current_period_end"]
    list_filter = ["status"]
    search_fields = ["shop__name"]
    readonly_fields = [
        "shop",
        "plan",
        "pending_plan",
        "status",
        "paystack_customer_code",
        "paystack_subscription_code",
        "paystack_email_token",
        "current_period_start",
        "current_period_end",
        "pending_checkout_reference",
        "pending_checkout_token",
        "pending_checkout_started_at",
        "created_at",
        "updated_at",
    ]

    def has_add_permission(self, request):
        return False

    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(PaymentHistory)
class PaymentHistoryAdmin(admin.ModelAdmin):
    list_display = ["shop", "plan", "amount", "paystack_reference", "paid_at"]
    search_fields = ["shop__name", "paystack_reference"]
    readonly_fields = ["shop", "plan", "amount", "paystack_reference", "paid_at", "created_at"]

    def has_add_permission(self, request):
        return False

    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(PaystackWebhookEvent)
class PaystackWebhookEventAdmin(admin.ModelAdmin):
    list_display = [
        "event_type",
        "event_key",
        "status",
        "attempts",
        "received_at",
        "processed_at",
    ]
    list_filter = ["status", "event_type"]
    search_fields = ["event_key", "payload_hash"]
    readonly_fields = [
        "payload_hash",
        "event_type",
        "event_key",
        "status",
        "attempts",
        "last_error",
        "received_at",
        "processed_at",
    ]

    def has_add_permission(self, request):
        return False

    def has_delete_permission(self, request, obj=None):
        return False
