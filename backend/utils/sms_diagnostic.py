"""
Temporary SMS diagnostic endpoint.
Hit GET /api/v1/debug/sms/?phone=08012345678 from a browser to test.
Remove this file after debugging is complete.
"""
import logging
from django.conf import settings
from django.http import JsonResponse
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated

logger = logging.getLogger(__name__)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def sms_diagnostic(request):
    phone = request.GET.get("phone", "")
    if not phone:
        return JsonResponse({"error": "Pass ?phone=08012345678"}, status=400)

    api_key = getattr(settings, "AT_API_KEY", "")
    username = getattr(settings, "AT_USERNAME", "")
    sender_id = getattr(settings, "AT_SENDER_ID", "")

    result = {
        "credentials": {
            "AT_USERNAME": username or "(empty!)",
            "AT_API_KEY": f"{api_key[:12]}...{api_key[-4:]}" if len(api_key) > 16 else (api_key or "(empty!)"),
            "AT_SENDER_ID": sender_id or "(empty — default short code)",
            "is_sandbox": username == "sandbox",
        },
        "target_phone": phone,
    }

    if not api_key or not username:
        result["status"] = "FAILED"
        result["error"] = "Missing AT_USERNAME or AT_API_KEY in environment"
        return JsonResponse(result)

    # Normalize
    from utils.sms import _normalize_nigerian_number
    normalized = _normalize_nigerian_number(phone)
    result["normalized_phone"] = normalized

    # Try sending
    try:
        import africastalking
        africastalking.initialize(username, api_key)
        sms = africastalking.SMS

        kwargs = {
            "message": "Hello! This is a test SMS from Giztrack.",
            "recipients": [normalized],
        }
        if sender_id:
            kwargs["sender_id"] = sender_id

        response = sms.send(**kwargs)
        result["raw_api_response"] = response

        recipients = response.get("SMSMessageData", {}).get("Recipients", [])
        if recipients and recipients[0].get("status") == "Success":
            result["status"] = "SUCCESS"
        else:
            result["status"] = "FAILED"
            result["message"] = response.get("SMSMessageData", {}).get("Message", "Unknown error")

    except Exception as e:
        result["status"] = "EXCEPTION"
        result["error"] = f"{type(e).__name__}: {e}"

    return JsonResponse(result, json_dumps_params={"indent": 2})
