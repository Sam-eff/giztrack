from unittest.mock import patch

from django.core.mail import EmailMessage, EmailMultiAlternatives
from django.test import SimpleTestCase, TestCase, override_settings

from utils.email_backends import ResendEmailBackend, ResendEmailError


class HealthcheckTests(TestCase):
    def test_healthcheck_returns_ok(self):
        response = self.client.get("/api/v1/health/")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["status"], "ok")
        self.assertEqual(response.json()["database"], "ok")


class ResendEmailBackendTests(SimpleTestCase):
    @override_settings(
        DEFAULT_FROM_EMAIL="Giztrack <noreply@giztrack.com>",
        RESEND_API_KEY="re_test_key",
        RESEND_API_URL="https://api.resend.test/emails",
        RESEND_TIMEOUT_SECONDS=9,
    )
    @patch("utils.email_backends.requests.post")
    def test_posts_plain_text_email_to_resend_api(self, mock_post):
        mock_post.return_value.status_code = 200

        message = EmailMessage(
            subject="Hello",
            body="Plain text body",
            from_email=None,
            to=["customer@example.com"],
            cc=["manager@example.com"],
            bcc=["audit@example.com"],
            reply_to=["support@giztrack.com"],
            headers={"X-Giztrack-Test": "yes"},
        )

        sent_count = ResendEmailBackend().send_messages([message])

        self.assertEqual(sent_count, 1)
        mock_post.assert_called_once()
        _, kwargs = mock_post.call_args
        self.assertEqual(kwargs["timeout"], 9)
        self.assertEqual(kwargs["headers"]["Authorization"], "Bearer re_test_key")
        self.assertEqual(kwargs["json"]["from"], "Giztrack <noreply@giztrack.com>")
        self.assertEqual(kwargs["json"]["to"], ["customer@example.com"])
        self.assertEqual(kwargs["json"]["text"], "Plain text body")
        self.assertEqual(kwargs["json"]["cc"], ["manager@example.com"])
        self.assertEqual(kwargs["json"]["bcc"], ["audit@example.com"])
        self.assertEqual(kwargs["json"]["reply_to"], ["support@giztrack.com"])
        self.assertEqual(kwargs["json"]["headers"], {"X-Giztrack-Test": "yes"})

    @override_settings(
        DEFAULT_FROM_EMAIL="Giztrack <noreply@giztrack.com>",
        RESEND_API_KEY="re_test_key",
        RESEND_API_URL="https://api.resend.test/emails",
    )
    @patch("utils.email_backends.requests.post")
    def test_posts_html_alternative_to_resend_api(self, mock_post):
        mock_post.return_value.status_code = 200

        message = EmailMultiAlternatives(
            subject="Hello",
            body="Plain text body",
            from_email="Giztrack <noreply@giztrack.com>",
            to=["customer@example.com"],
        )
        message.attach_alternative("<p>HTML body</p>", "text/html")

        sent_count = ResendEmailBackend().send_messages([message])

        self.assertEqual(sent_count, 1)
        self.assertEqual(mock_post.call_args.kwargs["json"]["text"], "Plain text body")
        self.assertEqual(mock_post.call_args.kwargs["json"]["html"], "<p>HTML body</p>")

    @override_settings(RESEND_API_KEY="re_test_key")
    @patch("utils.email_backends.requests.post")
    def test_raises_resend_error_for_api_failure(self, mock_post):
        mock_post.return_value.status_code = 422
        mock_post.return_value.text = '{"message":"Invalid from address"}'
        message = EmailMessage("Hello", "Body", "bad@example.com", ["customer@example.com"])

        with self.assertRaisesMessage(ResendEmailError, "HTTP 422"):
            ResendEmailBackend().send_messages([message])
