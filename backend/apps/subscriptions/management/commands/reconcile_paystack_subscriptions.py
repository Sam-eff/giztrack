from django.core.management.base import BaseCommand
from django.db.models import Q
from django.utils import timezone

from apps.subscriptions import paystack
from apps.subscriptions.models import Subscription
from apps.subscriptions.webhook import _calculate_period_end, _parse_datetime


class Command(BaseCommand):
    help = "Reconcile local subscriptions with active Paystack subscription records."

    def add_arguments(self, parser):
        parser.add_argument(
            "--shop-id",
            type=int,
            help="Only reconcile one shop.",
        )
        parser.add_argument(
            "--customer-code",
            help="Only reconcile one Paystack customer code.",
        )
        parser.add_argument(
            "--subscription-code",
            help="Only reconcile one Paystack subscription code.",
        )
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Show what would change without writing to the database.",
        )

    def handle(self, *args, **options):
        qs = Subscription.objects.select_related("shop", "plan").filter(
            Q(paystack_customer_code__gt="") | Q(paystack_subscription_code__gt="")
        )

        if options["shop_id"]:
            qs = qs.filter(shop_id=options["shop_id"])
        if options["customer_code"]:
            qs = qs.filter(paystack_customer_code=options["customer_code"])
        if options["subscription_code"]:
            qs = qs.filter(paystack_subscription_code=options["subscription_code"])

        total = 0
        updated = 0
        skipped = 0

        for subscription in qs.iterator():
            total += 1
            remote_subscription = paystack.find_subscription(
                subscription_code=subscription.paystack_subscription_code or None,
                customer_code=subscription.paystack_customer_code,
                plan_code=subscription.plan.paystack_plan_code if subscription.plan else None,
                statuses=["active", "non-renewing", "attention"],
            )

            if not remote_subscription:
                skipped += 1
                self.stdout.write(
                    f"Skipped shop={subscription.shop_id}: no active Paystack subscription found"
                )
                continue

            raw = remote_subscription.get("raw") or {}
            existing_paid_through = subscription.current_period_end
            if existing_paid_through and existing_paid_through <= timezone.now():
                existing_paid_through = None

            period_start = (
                _parse_datetime(raw.get("createdAt"))
                or _parse_datetime(raw.get("created_at"))
                or subscription.current_period_start
                or timezone.now()
            )
            period_end = (
                _parse_datetime(raw.get("next_payment_date"))
                or _parse_datetime(raw.get("nextPaymentDate"))
                or existing_paid_through
                or _calculate_period_end(
                    timezone.now(),
                    subscription.plan.interval if subscription.plan else "monthly",
                )
            )
            remote_status = (remote_subscription.get("status") or "").lower()
            local_status = (
                Subscription.Status.CANCELLED
                if remote_status == "non-renewing"
                else Subscription.Status.ACTIVE
            )

            self.stdout.write(
                "Reconciled shop=%s status=%s period_end=%s subscription_code=%s%s"
                % (
                    subscription.shop_id,
                    local_status,
                    period_end,
                    remote_subscription.get("subscription_code", ""),
                    " (dry run)" if options["dry_run"] else "",
                )
            )

            if options["dry_run"]:
                updated += 1
                continue

            subscription.status = local_status
            subscription.current_period_start = period_start
            subscription.current_period_end = period_end
            subscription.paystack_subscription_code = remote_subscription.get("subscription_code", "")
            subscription.paystack_email_token = remote_subscription.get("email_token", "")
            subscription.save(
                update_fields=[
                    "status",
                    "current_period_start",
                    "current_period_end",
                    "paystack_subscription_code",
                    "paystack_email_token",
                    "updated_at",
                ]
            )

            if period_end:
                subscription.shop.subscription_expires_at = period_end
                subscription.shop.save(update_fields=["subscription_expires_at"])

            updated += 1

        self.stdout.write(
            self.style.SUCCESS(
                f"Done. Checked {total}, reconciled {updated}, skipped {skipped}."
            )
        )
