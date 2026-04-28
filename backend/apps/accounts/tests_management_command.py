from io import StringIO
from unittest.mock import patch

from django.core.management import CommandError, call_command
from django.test import SimpleTestCase, override_settings


class SendTestEmailCommandTests(SimpleTestCase):
    @override_settings(
        DEFAULT_FROM_EMAIL="Giztrack <noreply@giztrack.com>",
        EMAIL_BACKEND="django.core.mail.backends.smtp.EmailBackend",
        EMAIL_HOST="smtp.example.com",
        EMAIL_PORT=587,
    )
    @patch("apps.accounts.management.commands.send_test_email.send_mail")
    def test_send_test_email_uses_current_mail_settings(self, mock_send_mail):
        stdout = StringIO()

        call_command("send_test_email", "ops@example.com", stdout=stdout)

        mock_send_mail.assert_called_once()
        _, kwargs = mock_send_mail.call_args
        self.assertEqual(kwargs["subject"], "Giztrack email test")
        self.assertEqual(kwargs["from_email"], "Giztrack <noreply@giztrack.com>")
        self.assertEqual(kwargs["recipient_list"], ["ops@example.com"])
        self.assertFalse(kwargs["fail_silently"])
        self.assertIn("smtp.example.com", kwargs["message"])
        self.assertIn("587", kwargs["message"])
        self.assertIn("Test email sent to ops@example.com", stdout.getvalue())

    def test_send_test_email_rejects_invalid_recipient(self):
        with self.assertRaisesMessage(
            CommandError,
            "Enter a valid recipient email address.",
        ):
            call_command("send_test_email", "not-an-email")
