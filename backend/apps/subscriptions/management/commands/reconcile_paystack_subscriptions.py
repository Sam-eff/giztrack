from django.core.management.base import BaseCommand
from django.db.models import Q

from apps.subscriptions.models import Subscription
from apps.subscriptions.reconciliation import reconcile_subscription


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
            try:
                result = reconcile_subscription(
                    subscription,
                    dry_run=options["dry_run"],
                )
            except Exception as exc:
                skipped += 1
                self.stderr.write(
                    self.style.ERROR(
                        f"Failed shop={subscription.shop_id}: {exc}"
                    )
                )
                continue

            if result["outcome"] == "skipped":
                skipped += 1
                self.stdout.write(
                    f"Skipped shop={subscription.shop_id}: {result['reason']}"
                )
                continue

            self.stdout.write(
                "Reconciled shop=%s outcome=%s status=%s period_end=%s subscription_code=%s%s"
                % (
                    subscription.shop_id,
                    result["outcome"],
                    result.get("status", ""),
                    result.get("period_end", ""),
                    result.get("subscription_code", ""),
                    " (dry run)" if options["dry_run"] else "",
                )
            )

            if result["outcome"] == "updated":
                updated += 1

        self.stdout.write(
            self.style.SUCCESS(
                f"Done. Checked {total}, reconciled {updated}, skipped {skipped}."
            )
        )
