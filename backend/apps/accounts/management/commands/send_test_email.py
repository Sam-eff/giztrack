from django.conf import settings
from django.core.exceptions import ValidationError
from django.core.mail import send_mail
from django.core.management.base import BaseCommand, CommandError
from django.core.validators import validate_email


class Command(BaseCommand):
    help = "Send a one-off test email using the current Django email configuration."

    def add_arguments(self, parser):
        parser.add_argument(
            "recipient",
            help="Email address that should receive the test email.",
        )
        parser.add_argument(
            "--subject",
            default="Giztrack email test",
            help="Optional subject line for the test email.",
        )
        parser.add_argument(
            "--message",
            default="",
            help="Optional plain-text message body to send instead of the default test content.",
        )

    def handle(self, *args, **options):
        recipient = options["recipient"].strip()
        subject = options["subject"].strip() or "Giztrack email test"
        custom_message = options["message"].strip()

        try:
            validate_email(recipient)
        except ValidationError as exc:
            raise CommandError("Enter a valid recipient email address.") from exc

        message = custom_message or (
            "This is a test email from the Giztrack backend.\n\n"
            "If you received this message, the current email configuration is working.\n\n"
            f"Email backend: {settings.EMAIL_BACKEND}\n"
            f"SMTP host: {getattr(settings, 'EMAIL_HOST', '')}\n"
            f"SMTP port: {getattr(settings, 'EMAIL_PORT', '')}\n"
            f"From address: {settings.DEFAULT_FROM_EMAIL}\n\n"
            "— Giztrack"
        )

        try:
            from utils.email_utils import send_giztrack_email
            send_giztrack_email(
                subject=subject,
                message=message,
                recipient_list=[recipient],
                fail_silently=False,
            )
        except Exception as exc:
            raise CommandError(f"Email send failed: {exc}") from exc

        self.stdout.write(
            self.style.SUCCESS(
                f"Test email sent to {recipient} via {settings.EMAIL_BACKEND}."
            )
        )
