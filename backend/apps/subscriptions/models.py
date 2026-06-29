
from django.db import models


class Plan(models.Model):
    name = models.CharField(max_length=100)
    description = models.TextField(blank=True)
    price = models.DecimalField(max_digits=10, decimal_places=2)
    paystack_plan_code = models.CharField(max_length=100, blank=True, default=None, unique=True, null=True)
    max_users = models.PositiveIntegerField(default=3)
    max_products = models.PositiveIntegerField(default=200)
    features = models.JSONField(default=list, blank=True)
    interval = models.CharField(
        max_length=20,
        choices=[("monthly", "Monthly"), ("yearly", "Yearly")],
        default="monthly"
    )
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["price"]

    def __str__(self):
        return f"{self.name} — ₦{self.price}/mo"

    def save(self, *args, **kwargs):
        # Store absent Paystack plan codes as NULL so multiple local/basic plans
        # can exist without colliding on a shared empty string in Postgres.
        if self.paystack_plan_code == "":
            self.paystack_plan_code = None
        super().save(*args, **kwargs)


class Subscription(models.Model):

    class Status(models.TextChoices):
        ACTIVE = "active", "Active"
        CANCELLED = "cancelled", "Cancelled"
        EXPIRED = "expired", "Expired"
        PENDING = "pending", "Pending"

    shop = models.OneToOneField(
        "shops.Shop", on_delete=models.CASCADE, related_name="subscription"
    )
    plan = models.ForeignKey(Plan, on_delete=models.SET_NULL, null=True)
    pending_plan = models.ForeignKey(
        Plan,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="pending_shop_subscriptions",
    )
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.PENDING)

    # Paystack identifiers — stored for cancellation and lookups
    paystack_customer_code = models.CharField(max_length=100, blank=True)
    paystack_subscription_code = models.CharField(max_length=100, blank=True)
    paystack_email_token = models.CharField(max_length=100, blank=True)

    current_period_start = models.DateTimeField(null=True, blank=True)
    current_period_end = models.DateTimeField(null=True, blank=True)
    pending_checkout_reference = models.CharField(max_length=200, blank=True, default="")
    pending_checkout_token = models.CharField(max_length=100, blank=True, default="")
    pending_checkout_started_at = models.DateTimeField(null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.shop.name} — {self.plan} ({self.status})"

    @property
    def has_pending_checkout(self):
        return bool(self.pending_plan_id and self.pending_checkout_token and self.pending_checkout_reference)


class PaymentHistory(models.Model):
    """Every successful Paystack charge is recorded here."""
    shop = models.ForeignKey("shops.Shop", on_delete=models.CASCADE, related_name="payments")
    plan = models.ForeignKey(Plan, on_delete=models.SET_NULL, null=True)
    amount = models.DecimalField(max_digits=10, decimal_places=2)
    paystack_reference = models.CharField(max_length=200, unique=True)
    paid_at = models.DateTimeField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-paid_at"]

    def __str__(self):
        return f"{self.shop.name} — ₦{self.amount} ({self.paid_at.date()})"


class PaystackWebhookEvent(models.Model):
    class Status(models.TextChoices):
        RECEIVED = "received", "Received"
        PROCESSED = "processed", "Processed"
        IGNORED = "ignored", "Ignored"
        FAILED = "failed", "Failed"

    payload_hash = models.CharField(max_length=64, unique=True)
    event_type = models.CharField(max_length=100, db_index=True)
    event_key = models.CharField(max_length=200, blank=True, db_index=True)
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.RECEIVED,
        db_index=True,
    )
    attempts = models.PositiveIntegerField(default=0)
    last_error = models.TextField(blank=True)
    received_at = models.DateTimeField(auto_now_add=True)
    processed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-received_at"]

    def __str__(self):
        return f"{self.event_type} ({self.event_key or self.payload_hash[:12]})"
