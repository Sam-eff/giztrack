import base64
import logging
from email.mime.base import MIMEBase

import requests
from django.conf import settings
from django.core.exceptions import ImproperlyConfigured
from django.core.mail.backends.base import BaseEmailBackend

logger = logging.getLogger(__name__)


class ResendEmailError(Exception):
    pass


class ResendEmailBackend(BaseEmailBackend):
    """
    Django email backend for Resend's HTTPS API.

    Railway disables outbound SMTP on non-Pro plans, so using Resend over HTTPS
    avoids blocked SMTP ports while keeping Django's normal send_mail API.
    """

    def __init__(self, fail_silently=False, **kwargs):
        super().__init__(fail_silently=fail_silently)
        self.api_key = (
            getattr(settings, "RESEND_API_KEY", "")
            or getattr(settings, "EMAIL_HOST_PASSWORD", "")
        )
        self.api_url = getattr(settings, "RESEND_API_URL", "https://api.resend.com/emails")
        self.timeout = getattr(settings, "RESEND_TIMEOUT_SECONDS", 15)

    def send_messages(self, email_messages):
        if not email_messages:
            return 0

        if not self.api_key:
            error = ImproperlyConfigured("RESEND_API_KEY is required for ResendEmailBackend.")
            if self.fail_silently:
                logger.error("Resend email backend is missing an API key.")
                return 0
            raise error

        sent_count = 0
        for message in email_messages:
            try:
                self._send_message(message)
            except Exception:
                if not self.fail_silently:
                    raise
                logger.exception("Resend email send failed.")
            else:
                sent_count += 1
        return sent_count

    def _send_message(self, message):
        response = requests.post(
            self.api_url,
            headers={
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type": "application/json",
            },
            json=self._build_payload(message),
            timeout=self.timeout,
        )
        if response.status_code >= 400:
            raise ResendEmailError(
                f"Resend email send failed with HTTP {response.status_code}: {response.text}"
            )

    def _build_payload(self, message):
        payload = {
            "from": message.from_email or settings.DEFAULT_FROM_EMAIL,
            "to": list(message.to),
            "subject": message.subject,
        }

        html_body = self._get_html_body(message)
        if getattr(message, "content_subtype", "") == "html":
            payload["html"] = message.body
        else:
            payload["text"] = message.body or ""
            if html_body:
                payload["html"] = html_body

        if message.cc:
            payload["cc"] = list(message.cc)
        if message.bcc:
            payload["bcc"] = list(message.bcc)
        if message.reply_to:
            payload["reply_to"] = list(message.reply_to)
        if message.extra_headers:
            payload["headers"] = dict(message.extra_headers)

        attachments = self._get_attachments(message)
        if attachments:
            payload["attachments"] = attachments

        return payload

    def _get_html_body(self, message):
        for alternative in getattr(message, "alternatives", []):
            if hasattr(alternative, "content"):
                content = alternative.content
                mimetype = alternative.mimetype
            else:
                content, mimetype = alternative[:2]
            if mimetype == "text/html":
                return content
        return ""

    def _get_attachments(self, message):
        attachments = []
        for attachment in message.attachments:
            filename, content = self._normalize_attachment(attachment)
            if not filename or content is None:
                continue
            if isinstance(content, str):
                content = content.encode()
            attachments.append(
                {
                    "filename": filename,
                    "content": base64.b64encode(content).decode("ascii"),
                }
            )
        return attachments

    def _normalize_attachment(self, attachment):
        if isinstance(attachment, MIMEBase):
            return attachment.get_filename(), attachment.get_payload(decode=True)

        filename = getattr(attachment, "filename", None)
        content = getattr(attachment, "content", None)
        if filename is not None:
            return filename, content

        return attachment[0], attachment[1]
