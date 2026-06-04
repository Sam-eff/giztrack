from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from django.contrib.auth.tokens import default_token_generator
from django.core.exceptions import ValidationError as DjangoValidationError
from django.core.validators import validate_email
from hmac import compare_digest
from django.middleware.csrf import get_token
from django.utils.decorators import method_decorator
from django.utils.http import urlsafe_base64_encode, urlsafe_base64_decode
from django.utils.encoding import force_bytes, force_str
from django.views.decorators.csrf import ensure_csrf_cookie

from django.conf import settings
import logging
from rest_framework import generics, status, permissions
from rest_framework.authentication import CSRFCheck
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.throttling import ScopedRateThrottle
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.views import TokenObtainPairView
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer, TokenRefreshSerializer

from utils.permissions import IsAdmin
from utils.email_utils import send_giztrack_email
from .serializers import (
    ShopRegisterSerializer,
    UserSerializer,
    UserUpdateSerializer,
    ChangePasswordSerializer,
    StaffCreateSerializer,
)

User = get_user_model()
logger = logging.getLogger(__name__)


def enforce_csrf(request):
    check = CSRFCheck(lambda req: None)
    check.process_request(request)
    reason = check.process_view(request, None, (), {})
    if reason:
        return Response({"detail": f"CSRF Failed: {reason}"}, status=status.HTTP_403_FORBIDDEN)
    return None


def prime_csrf_cookie(request, response):
    get_token(request)
    return response


def _cookie_base_options():
    options = {
        "httponly": True,
        "secure": settings.AUTH_COOKIE_SECURE,
        "samesite": settings.AUTH_COOKIE_SAMESITE,
        "path": "/",
    }
    if settings.AUTH_COOKIE_DOMAIN:
        options["domain"] = settings.AUTH_COOKIE_DOMAIN
    return options


def set_auth_cookies(response, access_token, refresh_token=None):
    access_lifetime = int(settings.SIMPLE_JWT["ACCESS_TOKEN_LIFETIME"].total_seconds())
    refresh_lifetime = int(settings.SIMPLE_JWT["REFRESH_TOKEN_LIFETIME"].total_seconds())
    cookie_options = _cookie_base_options()

    response.set_cookie(
        settings.AUTH_COOKIE_ACCESS,
        access_token,
        max_age=access_lifetime,
        **cookie_options,
    )
    if refresh_token:
        response.set_cookie(
            settings.AUTH_COOKIE_REFRESH,
            refresh_token,
            max_age=refresh_lifetime,
            **cookie_options,
        )
    response["Cache-Control"] = "no-store"
    return response


def clear_auth_cookies(response):
    cookie_options = {
        "path": "/",
        "samesite": settings.AUTH_COOKIE_SAMESITE,
    }
    if settings.AUTH_COOKIE_DOMAIN:
        cookie_options["domain"] = settings.AUTH_COOKIE_DOMAIN
    response.delete_cookie(settings.AUTH_COOKIE_ACCESS, **cookie_options)
    response.delete_cookie(settings.AUTH_COOKIE_REFRESH, **cookie_options)
    response["Cache-Control"] = "no-store"
    return response


def enforce_password_policy(password, user=None):
    try:
        validate_password(password, user=user)
    except DjangoValidationError as exc:
        return Response({"password": list(exc.messages)}, status=status.HTTP_400_BAD_REQUEST)
    return None


def _send_signup_welcome_email(shop, user):
    frontend_url = getattr(settings, "FRONTEND_URL", "http://localhost:5173").rstrip("/")
    login_url = f"{frontend_url}/login"

    try:
        send_giztrack_email(
            subject=f"Welcome to Giztrack, {shop.name}",
            message=(
                f"Hi {user.first_name},\n\n"
                f"Your shop account for {shop.name} has been created successfully.\n"
                f"You can sign in anytime at:\n"
                f"{login_url}\n\n"
                f"Your {shop.TRIAL_DURATION_DAYS}-day free trial is already active.\n"
                f"Registered email: {user.email}\n\n"
                f"If you did not create this account, please contact support immediately.\n\n"
                f"— Giztrack"
            ),
            recipient_list=[user.email],
            fail_silently=False,
        )
    except Exception:
        logger.exception(
            "Signup welcome email failed for user_id=%s shop_id=%s",
            user.pk,
            shop.pk,
        )


# ─── Custom JWT claims ────────────────────────────────────────────────────────
class CustomTokenObtainPairSerializer(TokenObtainPairSerializer):
    """Adds role and shop_id to the JWT payload for easy frontend use."""

    @classmethod
    def get_token(cls, user):
        token = super().get_token(user)
        token["role"] = user.role
        token["shop_id"] = user.shop_id
        token["full_name"] = user.get_full_name()
        return token

    def validate(self, attrs):
        data = super().validate(attrs)
        # Add user details to the login response body
        data["user"] = UserSerializer(self.user).data
        return data


class LoginView(TokenObtainPairView):
    serializer_class = CustomTokenObtainPairSerializer
    permission_classes = [permissions.AllowAny]

    def post(self, request, *args, **kwargs):
        csrf_error = enforce_csrf(request)
        if csrf_error:
            return prime_csrf_cookie(request, csrf_error)

        response = super().post(request, *args, **kwargs)
        if response.status_code == status.HTTP_200_OK:
            access = response.data.pop("access", None)
            refresh = response.data.pop("refresh", None)
            if access and refresh:
                set_auth_cookies(response, access, refresh)
        return prime_csrf_cookie(request, response)


# ─── Shop Registration ────────────────────────────────────────────────────────
class ShopRegisterView(APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        csrf_error = enforce_csrf(request)
        if csrf_error:
            return prime_csrf_cookie(request, csrf_error)

        serializer = ShopRegisterSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        shop, user = serializer.save()
        _send_signup_welcome_email(shop, user)

        refresh = RefreshToken.for_user(user)
        response = Response(
            {
                "message": f"Welcome to Giztrack, {shop.name}!",
                "user": UserSerializer(user).data,
            },
            status=status.HTTP_201_CREATED,
        )
        set_auth_cookies(response, str(refresh.access_token), str(refresh))
        return prime_csrf_cookie(request, response)


@method_decorator(ensure_csrf_cookie, name="dispatch")
class CsrfCookieView(APIView):
    permission_classes = [permissions.AllowAny]

    def get(self, request):
        return prime_csrf_cookie(
            request,
            Response({"message": "CSRF cookie set."}, status=status.HTTP_200_OK),
        )


class CookieTokenRefreshView(APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        csrf_error = enforce_csrf(request)
        if csrf_error:
            return prime_csrf_cookie(request, csrf_error)

        refresh_token = request.data.get("refresh") or request.COOKIES.get(settings.AUTH_COOKIE_REFRESH)
        if not refresh_token:
            response = clear_auth_cookies(
                Response({"detail": "No refresh token provided."}, status=status.HTTP_401_UNAUTHORIZED)
            )
            return prime_csrf_cookie(request, response)

        serializer = TokenRefreshSerializer(data={"refresh": refresh_token})
        if not serializer.is_valid():
            response = clear_auth_cookies(Response(serializer.errors, status=status.HTTP_401_UNAUTHORIZED))
            return prime_csrf_cookie(request, response)

        access = serializer.validated_data["access"]
        rotated_refresh = serializer.validated_data.get("refresh", refresh_token)
        response = Response({"message": "Session refreshed."}, status=status.HTTP_200_OK)
        set_auth_cookies(response, access, rotated_refresh)
        return prime_csrf_cookie(request, response)


# ─── Logout ──────────────────────────────────────────────────────────────────
class LogoutView(APIView):
    def post(self, request):
        csrf_error = enforce_csrf(request)
        if csrf_error:
            return prime_csrf_cookie(request, csrf_error)

        refresh_token = request.data.get("refresh") or request.COOKIES.get(settings.AUTH_COOKIE_REFRESH)
        if refresh_token:
            try:
                RefreshToken(refresh_token).blacklist()
            except TokenError:
                pass

        response = Response({"message": "Logged out successfully."}, status=status.HTTP_200_OK)
        clear_auth_cookies(response)
        return prime_csrf_cookie(request, response)


# ─── Current User Profile ─────────────────────────────────────────────────────
@method_decorator(ensure_csrf_cookie, name="dispatch")
class MeView(generics.RetrieveUpdateAPIView):
    def get_serializer_class(self):
        if self.request.method in ("PUT", "PATCH"):
            return UserUpdateSerializer
        return UserSerializer

    def get_object(self):
        return self.request.user

    def update(self, request, *args, **kwargs):
        partial = kwargs.pop("partial", False)
        instance = self.get_object()
        serializer = self.get_serializer(instance, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        self.perform_update(serializer)
        return Response(UserSerializer(instance).data)


# ─── Change Password ─────────────────────────────────────────────────────────
class ChangePasswordView(APIView):
    def post(self, request):
        serializer = ChangePasswordSerializer(data=request.data, context={"user": request.user})
        serializer.is_valid(raise_exception=True)

        user = request.user
        if not user.check_password(serializer.validated_data["old_password"]):
            return Response(
                {"old_password": "Incorrect password."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        user.set_password(serializer.validated_data["new_password"])
        user.save()
        refresh = RefreshToken.for_user(user)
        response = Response({"message": "Password updated successfully."})
        return set_auth_cookies(response, str(refresh.access_token), str(refresh))


# ─── Staff Management (Admin only) ───────────────────────────────────────────
class StaffListCreateView(generics.ListCreateAPIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def get_serializer_class(self):
        if self.request.method == 'POST':
            return StaffCreateSerializer
        return UserSerializer

    def get_queryset(self):
        return User.objects.filter(shop=self.request.user.shop).exclude(
            id=self.request.user.id
        )

    def create(self, request, *args, **kwargs):
        shop = request.user.shop
        if not shop.can_add_team_member():
            plan = shop.effective_plan_for_limits
            limit = shop.team_member_limit
            return Response(
                {
                    "detail": (
                        f"Your {(plan.name if plan else 'current')} plan allows up to "
                        f"{limit} active team member(s). Remove someone or upgrade your plan to add more."
                    )
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        return super().create(request, *args, **kwargs)


class StaffDetailView(generics.RetrieveUpdateDestroyAPIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]
    serializer_class = UserSerializer

    def get_queryset(self):
        return User.objects.filter(shop=self.request.user.shop)

    def destroy(self, request, *args, **kwargs):
        user = self.get_object()
        if user == request.user:
            return Response(
                {"error": "You cannot delete your own account."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        user.is_active = False  # Soft delete
        user.save()
        return Response({"message": "Staff account deactivated."}, status=status.HTTP_200_OK)


# ─── Forgot Password (email link) ────────────────────────────────────────────
class ForgotPasswordView(APIView):
    permission_classes = [permissions.AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "password_reset"  # 5/hour — defined in settings.py

    def post(self, request):
        csrf_error = enforce_csrf(request)
        if csrf_error:
            return prime_csrf_cookie(request, csrf_error)

        email = request.data.get("email", "").lower().strip()
        try:
            validate_email(email)
        except DjangoValidationError:
            user = None
        else:
            user = User.objects.filter(email=email).first()

        # Always return 200 to avoid email enumeration
        if user:
            uid = urlsafe_base64_encode(force_bytes(user.pk))
            token = default_token_generator.make_token(user)
            frontend_url = getattr(settings, "FRONTEND_URL", "http://localhost:5173").rstrip("/")
            reset_link = f"{frontend_url}/reset-password?uid={uid}&token={token}"

            try:
                send_giztrack_email(
                    subject="Reset your Giztrack password",
                    message=(
                        f"Hi {user.first_name},\n\n"
                        f"We received a request to reset your password.\n"
                        f"Click the link below to set a new password (valid for 3 days):\n\n"
                        f"{reset_link}\n\n"
                        f"If you didn't request this, you can ignore this email.\n\n"
                        f"— Giztrack"
                    ),
                    recipient_list=[user.email],
                    fail_silently=False,
                )
            except Exception:
                logger.exception("Password reset email failed for user_id=%s", user.pk)

        response = Response(
            {"message": "If that email is registered, a reset link has been sent."},
            status=status.HTTP_200_OK,
        )
        return prime_csrf_cookie(request, response)


# ─── Reset Password (from email link) ────────────────────────────────────────
class ResetPasswordView(APIView):
    permission_classes = [permissions.AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "password_reset"  # 5/hour — prevents brute-forcing reset tokens

    def post(self, request):
        csrf_error = enforce_csrf(request)
        if csrf_error:
            return prime_csrf_cookie(request, csrf_error)

        uid = request.data.get("uid", "")
        token = request.data.get("token", "")
        new_password = request.data.get("new_password", "")

        if not uid or not token or not new_password:
            return Response(
                {"error": "uid, token and new_password are required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            user_pk = force_str(urlsafe_base64_decode(uid))
            user = User.objects.get(pk=user_pk)
        except (User.DoesNotExist, ValueError, TypeError):
            return Response(
                {"error": "Invalid reset link."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if not default_token_generator.check_token(user, token):
            return Response(
                {"error": "Reset link has expired or is invalid. Please request a new one."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        password_error = enforce_password_policy(new_password, user)
        if password_error:
            return prime_csrf_cookie(request, password_error)

        user.set_password(new_password)
        user.save()
        response = Response({"message": "Password reset successfully. You can now log in."})
        clear_auth_cookies(response)
        return prime_csrf_cookie(request, response)


# ─── Admin resets a staff member's password ───────────────────────────────────
class AdminResetStaffPasswordView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def post(self, request, pk):
        try:
            staff = User.objects.get(pk=pk, shop=request.user.shop)
        except User.DoesNotExist:
            return Response(
                {"error": "Staff member not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        if staff == request.user:
            return Response(
                {"error": "Use the Security tab to change your own password."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        new_password = request.data.get("new_password", "")
        if len(new_password) < 8:
            return Response(
                {"error": "New password must be at least 8 characters."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        password_error = enforce_password_policy(new_password, staff)
        if password_error:
            return password_error

        staff.set_password(new_password)
        staff.save()
        return Response({"message": f"Password for {staff.get_full_name()} has been reset."})


class BootstrapAdminView(APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        configured_token = settings.BOOTSTRAP_ADMIN_TOKEN.strip()
        if not configured_token:
            return Response(
                {"error": "Bootstrap admin endpoint is disabled."},
                status=status.HTTP_404_NOT_FOUND,
            )

        provided_token = (
            request.headers.get("X-Bootstrap-Token")
            or request.data.get("bootstrap_token", "")
        ).strip()

        if not provided_token or not compare_digest(provided_token, configured_token):
            return Response(
                {"error": "Invalid bootstrap token."},
                status=status.HTTP_403_FORBIDDEN,
            )

        if User.objects.filter(is_superuser=True).exists():
            return Response(
                {"error": "A superuser already exists. Disable this endpoint now."},
                status=status.HTTP_409_CONFLICT,
            )

        email = request.data.get("email", "").strip().lower()
        first_name = request.data.get("first_name", "").strip()
        last_name = request.data.get("last_name", "").strip()
        password = request.data.get("password", "")

        if not email or not first_name or not last_name or not password:
            return Response(
                {"error": "email, first_name, last_name and password are required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            validate_email(email)
        except DjangoValidationError:
            return Response(
                {"error": "Enter a valid email address."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        password_error = enforce_password_policy(password)
        if password_error:
            return password_error

        user = User.objects.create_superuser(
            email=email,
            password=password,
            first_name=first_name,
            last_name=last_name,
        )

        return Response(
            {
                "message": (
                    "Production admin created successfully. Remove BOOTSTRAP_ADMIN_TOKEN now."
                ),
                "email": user.email,
            },
            status=status.HTTP_201_CREATED,
        )
