import json
from django.http import JsonResponse
from django.utils import timezone


SAFE_METHODS = ("GET", "HEAD", "OPTIONS")

# Endpoints always allowed regardless of subscription status
EXEMPT_PATHS = [
    "/api/v1/auth/login/",
    "/api/v1/auth/register/",
    "/api/v1/auth/refresh/",
    "/api/v1/auth/token/refresh/",
    "/api/v1/auth/logout/",
    "/api/v1/auth/forgot-password/",
    "/api/v1/subscriptions/webhook/",    # Paystack webhook must always reach us
    "/api/v1/subscriptions/plans/",      # Users need to see plans even when expired
    "/api/v1/subscriptions/initialize/", # Users need to be able to pay
    "/api/v1/subscriptions/sync/",       # Locked users need to refresh provider state
    "/api/v1/subscriptions/callback/",   # Paystack callback redirect
    "/api/v1/subscriptions/current/",    # Frontend polls this to check subscription state
    "/admin/",
]


class SubscriptionMiddleware:
    """
    Blocks write operations (POST/PUT/PATCH/DELETE) for shops whose
    subscription has expired and whose 30-day trial has also ended.
    GET requests are always allowed so owners can still see their data.
    """

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        if request.method not in SAFE_METHODS and self._should_check(request):
            user = getattr(request, "user", None)
            if user and user.is_authenticated and user.shop_id:
                shop = user.shop
                if not shop.has_app_access:
                    return JsonResponse(
                        {
                            "error": "subscription_expired",
                            "message": (
                                "Your subscription has expired. "
                                "Please renew to continue adding records."
                            ),
                        },
                        status=402,
                    )

        return self.get_response(request)

    def _should_check(self, request):
        path = request.path
        return not any(path.startswith(exempt) for exempt in EXEMPT_PATHS)
