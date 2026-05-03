import logging
import re
from django.conf import settings

logger = logging.getLogger(__name__)


def _normalize_nigerian_number(phone: str) -> str:
    """
    Normalizes a Nigerian phone number to international format (+234...).
    Handles formats like: 08012345678, 8012345678, +2348012345678, 2348012345678
    """
    phone = re.sub(r"[\s\-()]", "", phone)  # strip spaces, dashes, brackets

    if phone.startswith("+234"):
        return phone
    if phone.startswith("234"):
        return f"+{phone}"
    if phone.startswith("0") and len(phone) == 11:
        return f"+234{phone[1:]}"
    if len(phone) == 10:
        return f"+234{phone}"

    # Fallback: just prepend + if not there
    return f"+{phone}" if not phone.startswith("+") else phone


def send_sms(to_number: str, message: str) -> bool:
    """
    Sends an SMS message using Africa's Talking.
    Returns True if successful, False otherwise.

    Set AT_USERNAME='sandbox' and AT_API_KEY='any-string' for free local testing.
    """
    api_key = getattr(settings, "AT_API_KEY", "")
    username = getattr(settings, "AT_USERNAME", "")
    sender_id = getattr(settings, "AT_SENDER_ID", "")

    logger.info(
        "[SMS] Attempting to send SMS. "
        "AT_USERNAME=%s, AT_API_KEY=%s, AT_SENDER_ID=%s, to=%s",
        username or "(empty)",
        f"{api_key[:8]}...{api_key[-4:]}" if len(api_key) > 12 else "(too short or empty)",
        sender_id or "(empty)",
        to_number,
    )

    if not api_key or not username:
        logger.warning("[SMS] Africa's Talking credentials not configured. SMS not sent.")
        # In DEBUG mode, pretend it succeeded so development flows still work
        return bool(getattr(settings, "DEBUG", False))

    if username == "sandbox":
        logger.warning("[SMS] AT_USERNAME is still 'sandbox'. SMS will NOT reach real phones!")

    try:
        import africastalking

        africastalking.initialize(username, api_key)
        sms = africastalking.SMS

        to_number = _normalize_nigerian_number(to_number)
        logger.info("[SMS] Normalized phone: %s", to_number)

        kwargs = {
            "message": message,
            "recipients": [to_number],
        }
        if sender_id:
            kwargs["sender_id"] = sender_id

        response = sms.send(**kwargs)
        logger.info("[SMS] Full API response: %s", response)

        recipients = response.get("SMSMessageData", {}).get("Recipients", [])

        if recipients and recipients[0].get("status") == "Success":
            logger.info("[SMS] SMS sent successfully to %s", to_number)
            return True
        else:
            api_message = response.get("SMSMessageData", {}).get("Message", "No message")
            logger.error("[SMS] Africa's Talking SMS failed. Recipients: %s, Message: %s", recipients, api_message)
            return False

    except Exception as e:
        logger.error("[SMS] Unexpected error sending SMS: %s: %s", type(e).__name__, e)
        return False
