import sys
from types import ModuleType, SimpleNamespace
from unittest.mock import Mock, patch

from django.core.files.base import ContentFile
from django.core.mail import EmailMessage, EmailMultiAlternatives
from django.test import SimpleTestCase, TestCase, override_settings

from utils.cloudinary_storage import CloudinaryMediaStorage
from utils.email_backends import ResendEmailBackend, ResendEmailError
from utils.staticfiles import TolerantCompressedManifestStaticFilesStorage


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


class CloudinaryMediaStorageTests(SimpleTestCase):
    @override_settings(
        CLOUDINARY_CLOUD_NAME="demo-cloud",
        CLOUDINARY_API_KEY="api-key",
        CLOUDINARY_API_SECRET="api-secret",
        CLOUDINARY_FOLDER="giztrack",
        CLOUDINARY_TIMEOUT_SECONDS=12,
    )
    def test_save_uploads_to_cloudinary_folder(self):
        upload_mock = Mock(return_value={"public_id": "unused"})
        destroy_mock = Mock(return_value={"result": "ok"})

        cloudinary_module = ModuleType("cloudinary")
        cloudinary_module.__path__ = []
        cloudinary_module.config = Mock(return_value=SimpleNamespace(cloud_name="demo-cloud"))
        uploader_module = ModuleType("cloudinary.uploader")
        uploader_module.upload = upload_mock
        uploader_module.destroy = destroy_mock
        utils_module = ModuleType("cloudinary.utils")
        utils_module.cloudinary_url = Mock(
            return_value=("https://res.cloudinary.com/demo-cloud/image/upload/giztrack/file", {})
        )
        cloudinary_module.uploader = uploader_module
        cloudinary_module.utils = utils_module

        with patch.dict(
            sys.modules,
            {
                "cloudinary": cloudinary_module,
                "cloudinary.uploader": uploader_module,
                "cloudinary.utils": utils_module,
            },
        ):
            storage = CloudinaryMediaStorage()
            saved_name = storage.save(
                "inventory/products/My Phone.JPG",
                ContentFile(b"fake image data"),
            )
            url = storage.url(saved_name)
            storage.delete(saved_name)

        self.assertRegex(
            saved_name,
            r"^giztrack/inventory/products/my_phone-[a-f0-9]{12}$",
        )
        upload_mock.assert_called_once()
        _, kwargs = upload_mock.call_args
        self.assertEqual(kwargs["public_id"], saved_name)
        self.assertEqual(kwargs["resource_type"], "image")
        self.assertFalse(kwargs["overwrite"])
        self.assertEqual(kwargs["timeout"], 12)
        self.assertEqual(url, "https://res.cloudinary.com/demo-cloud/image/upload/giztrack/file")
        destroy_mock.assert_called_once_with(saved_name, resource_type="image", invalidate=True)


class StaticFilesStorageTests(SimpleTestCase):
    def test_staticfiles_storage_does_not_rewrite_sourcemap_references(self):
        patterns = TolerantCompressedManifestStaticFilesStorage.patterns
        pattern_sources = [
            pattern[0] if isinstance(pattern, (tuple, list)) else pattern
            for _extension, pattern_group in patterns
            for pattern in pattern_group
        ]

        self.assertFalse(
            any("sourceMappingURL" in pattern for pattern in pattern_sources)
        )
