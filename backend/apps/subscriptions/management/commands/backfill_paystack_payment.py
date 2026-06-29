from decimal import Decimal, InvalidOperation

from django.core.management.base import BaseCommand, CommandError
from django.db.models import Q

from apps.subscriptions import paystack
from apps.subscriptions.models import PaymentHistory, Subscription
from apps.subscriptions.webhook import _as_dict, _parse_datetime


class Command(BaseCommand):
    help = "Verify one successful Paystack transaction and backfill its payment history."

    def add_arguments(self, parser):
        selector = parser.add_mutually_exclusive_group()
        selector.add_argument("--shop-id", type=int)
        selector.add_argument("--shop-email")
        parser.add_argument("--reference", required=True)
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Verify and show the change without writing it.",
        )

    def handle(self, *args, **options):
        reference = options["reference"].strip()
        if not reference:
            raise CommandError("A Paystack transaction reference is required.")

        transaction = paystack.verify_transaction(reference)
        if (transaction.get("status") or "").lower() != "success":
            raise CommandError("Paystack does not report this transaction as successful.")

        customer = _as_dict(transaction.get("customer"))
        metadata = _as_dict(transaction.get("metadata"))
        subscription = self._resolve_subscription(options, customer, metadata)
        transaction_customer_code = (customer.get("customer_code") or "").strip()
        transaction_email = (customer.get("email") or "").strip().lower()
        known_emails = {
            email.lower()
            for email in [
                subscription.shop.email,
                *subscription.shop.users.filter(is_active=True).values_list(
                    "email",
                    flat=True,
                ),
            ]
            if email
        }

        customer_matches = bool(
            subscription.paystack_customer_code
            and transaction_customer_code
            and subscription.paystack_customer_code == transaction_customer_code
        )
        email_matches = bool(transaction_email and transaction_email in known_emails)
        metadata_shop_matches = str(metadata.get("shop_id") or "") == str(
            subscription.shop_id
        )
        if not any([customer_matches, email_matches, metadata_shop_matches]):
            raise CommandError(
                "Transaction customer and metadata do not match this shop."
            )

        plan_candidates = [
            _as_dict(transaction.get("plan_object")).get("plan_code"),
            _as_dict(transaction.get("plan")).get("plan_code"),
        ]
        transaction_plan_code = next(
            (value for value in plan_candidates if value),
            "",
        )
        local_plan_code = (
            subscription.plan.paystack_plan_code
            if subscription.plan
            else ""
        )
        if (
            transaction_plan_code
            and local_plan_code
            and transaction_plan_code != local_plan_code
        ):
            raise CommandError("Transaction plan does not match the shop's plan.")

        paid_at = (
            _parse_datetime(transaction.get("paid_at"))
            or _parse_datetime(transaction.get("paidAt"))
            or _parse_datetime(transaction.get("transaction_date"))
        )
        if not paid_at:
            raise CommandError("Paystack transaction has no valid payment date.")

        try:
            amount = Decimal(str(transaction.get("amount") or 0)) / Decimal("100")
        except (InvalidOperation, TypeError, ValueError) as exc:
            raise CommandError("Paystack transaction amount is invalid.") from exc
        if amount <= 0:
            raise CommandError("Paystack transaction amount must be greater than zero.")

        if options["dry_run"]:
            self.stdout.write(
                self.style.SUCCESS(
                    f"Verified shop={subscription.shop_id} reference={reference} "
                    f"amount={amount} paid_at={paid_at} (dry run)"
                )
            )
            return

        payment, created = PaymentHistory.objects.get_or_create(
            paystack_reference=reference,
            defaults={
                "shop": subscription.shop,
                "plan": subscription.plan,
                "amount": amount,
                "paid_at": paid_at,
            },
        )
        if not created and payment.shop_id != subscription.shop_id:
            raise CommandError("This Paystack reference is already linked to another shop.")

        action = "Created" if created else "Already present"
        self.stdout.write(
            self.style.SUCCESS(
                f"{action}: shop={subscription.shop_id} reference={reference} "
                f"amount={amount} paid_at={paid_at}"
            )
        )

    def _resolve_subscription(self, options, customer, metadata):
        subscriptions = Subscription.objects.select_related("shop", "plan")

        if options.get("shop_id"):
            try:
                return subscriptions.get(shop_id=options["shop_id"])
            except Subscription.DoesNotExist as exc:
                raise CommandError("Subscription not found for this shop.") from exc

        if options.get("shop_email"):
            return self._subscription_for_email(
                subscriptions,
                options["shop_email"],
                required=True,
            )

        metadata_shop_id = metadata.get("shop_id")
        if str(metadata_shop_id or "").isdigit():
            match = self._single_match(
                subscriptions.filter(shop_id=int(metadata_shop_id)),
                "Paystack transaction metadata",
            )
            if match:
                return match

        customer_code = (customer.get("customer_code") or "").strip()
        if customer_code:
            match = self._single_match(
                subscriptions.filter(paystack_customer_code=customer_code),
                "Paystack customer code",
            )
            if match:
                return match

        customer_email = (customer.get("email") or "").strip()
        if customer_email:
            match = self._subscription_for_email(
                subscriptions,
                customer_email,
                required=False,
            )
            if match:
                return match

        raise CommandError(
            "Could not identify the shop from this Paystack transaction. "
            "Use --shop-email to select it explicitly."
        )

    def _subscription_for_email(self, subscriptions, email, *, required):
        email = (email or "").strip()
        match = self._single_match(
            subscriptions.filter(
                Q(shop__email__iexact=email)
                | Q(shop__users__email__iexact=email)
            ).distinct(),
            "shop email",
        )
        if match or not required:
            return match
        raise CommandError("Subscription not found for this shop email.")

    def _single_match(self, queryset, source):
        matches = list(queryset[:2])
        if len(matches) > 1:
            raise CommandError(
                f"More than one subscription matches the {source}. "
                "Use --shop-id to select one explicitly."
            )
        return matches[0] if matches else None
