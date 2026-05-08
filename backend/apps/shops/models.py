from django.db import models
from django.core.exceptions import ObjectDoesNotExist
from django.utils import timezone
from datetime import timedelta


class Shop(models.Model):
    TRIAL_DURATION_DAYS = 30

    name = models.CharField(max_length=200)
    owner_name = models.CharField(max_length=200)
    email = models.EmailField(unique=True)
    phone = models.CharField(max_length=20)
    address = models.TextField(blank=True)
    logo = models.ImageField(upload_to="shop_logos/", null=True, blank=True)

    # Subscription state
    is_active = models.BooleanField(default=True)
    subscription_expires_at = models.DateTimeField(null=True, blank=True)

    # Preferences
    enable_sms_notifications = models.BooleanField(default=False)
    allow_staff_inventory_management = models.BooleanField(default=False)
    allow_staff_sales = models.BooleanField(default=True)
    allow_staff_expense_logging = models.BooleanField(default=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["email"]),
        ]

    def __str__(self):
        return self.name

    @property
    def subscription_is_active(self):
        """Returns True if the shop has a valid, unexpired subscription."""
        now = timezone.now()
        subscription = self.current_subscription

        if not subscription:
            return False

        if subscription and subscription.current_period_end and subscription.current_period_end > now:
            return subscription.status in {"active", "cancelled"}

        if not self.subscription_expires_at:
            return False
        return (
            subscription.status in {"active", "cancelled"}
            and self.subscription_expires_at > now
        )

    @property
    def current_subscription(self):
        try:
            return self.subscription
        except ObjectDoesNotExist:
            return None

    @property
    def current_plan_name(self):
        subscription = self.current_subscription
        if not subscription or not subscription.plan or not self.subscription_is_active:
            return None
        return subscription.plan.name

    @property
    def current_plan(self):
        subscription = self.current_subscription
        if not subscription or not subscription.plan or not self.subscription_is_active:
            return None
        return subscription.plan

    @property
    def effective_plan_for_limits(self):
        plan = self.current_plan
        if plan:
            return plan

        if self.is_in_trial:
            from apps.subscriptions.models import Plan

            return (
                Plan.objects.filter(is_active=True, name__iexact="Pro")
                .order_by("-max_users", "-max_products", "-price")
                .first()
            )

        return None

    @property
    def team_member_limit(self):
        plan = self.effective_plan_for_limits
        return plan.max_users if plan else None

    @property
    def product_limit(self):
        plan = self.effective_plan_for_limits
        return plan.max_products if plan else None

    @property
    def active_user_count(self):
        return self.users.filter(is_active=True).count()

    @property
    def active_product_count(self):
        return self.products.filter(is_active=True).count()

    def can_add_team_member(self):
        limit = self.team_member_limit
        if limit is None:
            return True
        return self.active_user_count < limit

    def can_add_product(self):
        limit = self.product_limit
        if limit is None:
            return True
        return self.active_product_count < limit

    @property
    def has_app_access(self):
        return self.subscription_is_active or self.is_in_trial

    @property
    def has_pro_access(self):
        plan_name = (self.current_plan_name or "").strip().lower()
        # The free trial grants temporary Pro access only until a paid plan begins.
        # Once a shop is actively subscribed to Basic, it should behave like Basic
        # immediately instead of keeping trial-era Pro privileges.
        return plan_name == "pro" or (self.is_in_trial and not self.subscription_is_active)

    @property
    def is_in_trial(self):
        """30-day trial from creation — no payment required yet."""
        trial_end = self.created_at + timedelta(days=self.TRIAL_DURATION_DAYS)
        return timezone.now() < trial_end

    @property
    def trial_days_remaining(self):
        if not self.is_in_trial:
            return 0
        trial_end = self.created_at + timedelta(days=self.TRIAL_DURATION_DAYS)
        return max(0, (trial_end - timezone.now()).days)
