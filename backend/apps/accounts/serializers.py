from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
from rest_framework import serializers

from apps.shops.models import Shop
from apps.accounts.models import Role

User = get_user_model()


def _validate_password_strength(password, user=None):
    try:
        validate_password(password, user=user)
    except DjangoValidationError as exc:
        raise serializers.ValidationError(list(exc.messages))


class ShopRegisterSerializer(serializers.Serializer):
    """
    Registers a new shop + creates the admin user in one atomic operation.
    """
    # Shop fields
    shop_name = serializers.CharField(max_length=200)
    shop_phone = serializers.CharField(max_length=20)
    shop_address = serializers.CharField(required=False, allow_blank=True)

    # Admin user fields
    first_name = serializers.CharField(max_length=100)
    last_name = serializers.CharField(max_length=100)
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True, min_length=8)
    confirm_password = serializers.CharField(write_only=True)

    def validate_email(self, value):
        if User.objects.filter(email=value).exists():
            raise serializers.ValidationError("An account with this email already exists.")
        return value.lower()

    def validate_shop_phone(self, value):
        import re
        if not re.match(r'^(\+\d{1,3}\s?)?\d{10,11}$', value):
            raise serializers.ValidationError(
                "Phone must be exactly 10 or 11 digits (with optional country code, e.g., +234)"
            )
        return value

    def validate(self, data):
        if data["password"] != data["confirm_password"]:
            raise serializers.ValidationError({"confirm_password": "Passwords do not match."})

        candidate_user = User(
            email=data["email"],
            first_name=data["first_name"],
            last_name=data["last_name"],
        )
        try:
            _validate_password_strength(data["password"], candidate_user)
        except serializers.ValidationError as exc:
            raise serializers.ValidationError({"password": exc.detail})
        return data

    @transaction.atomic
    def save(self):
        data = self.validated_data

        # 1. Create the shop
        shop = Shop.objects.create(
            name=data["shop_name"],
            owner_name=f"{data['first_name']} {data['last_name']}",
            email=data["email"],
            phone=data["shop_phone"],
            address=data.get("shop_address", ""),
        )

        # 2. Create the admin user linked to this shop
        user = User.objects.create_user(
            email=data["email"],
            password=data["password"],
            first_name=data["first_name"],
            last_name=data["last_name"],
            shop=shop,
            role=Role.ADMIN,
        )

        return shop, user


class UserSerializer(serializers.ModelSerializer):
    """Read-only serializer for user profile responses."""
    full_name = serializers.SerializerMethodField()
    shop_name = serializers.SerializerMethodField()
    subscription_plan = serializers.SerializerMethodField()
    subscription_status = serializers.SerializerMethodField()
    is_in_trial = serializers.SerializerMethodField()
    trial_days_remaining = serializers.SerializerMethodField()
    has_active_subscription = serializers.SerializerMethodField()
    has_app_access = serializers.SerializerMethodField()
    has_pro_access = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = [
            "id", "email", "first_name", "last_name", "full_name",
            "phone", "role", "shop", "shop_name", "date_joined",
            "subscription_plan", "subscription_status",
            "is_in_trial", "trial_days_remaining",
            "has_active_subscription", "has_app_access", "has_pro_access", "is_active",
        ]
        read_only_fields = ["id", "email", "role", "shop", "date_joined"]

    def get_full_name(self, obj):
        return obj.get_full_name()

    def get_shop_name(self, obj):
        return obj.shop.name if obj.shop else None

    def get_subscription_plan(self, obj):
        if not obj.shop:
            return None

        if obj.shop.current_plan_name:
            return obj.shop.current_plan_name

        if obj.shop.is_in_trial:
            return "Pro Trial"

        return None

    def get_subscription_status(self, obj):
        if not obj.shop:
            return "inactive"

        if obj.shop.subscription_is_active:
            return "active"

        if obj.shop.is_in_trial:
            return "trial"

        subscription = obj.shop.current_subscription
        return subscription.status if subscription else "inactive"

    def get_is_in_trial(self, obj):
        return obj.shop.is_in_trial if obj.shop else False

    def get_trial_days_remaining(self, obj):
        return obj.shop.trial_days_remaining if obj.shop else 0

    def get_has_active_subscription(self, obj):
        return obj.shop.subscription_is_active if obj.shop else False

    def get_has_app_access(self, obj):
        return obj.shop.has_app_access if obj.shop else False

    def get_has_pro_access(self, obj):
        return obj.shop.has_pro_access if obj.shop else False


class UserUpdateSerializer(serializers.ModelSerializer):
    """Allows a user to update their own profile (not role or shop)."""

    class Meta:
        model = User
        fields = ["first_name", "last_name", "phone"]

    def validate_phone(self, value):
        import re
        if value:
            # Strip spaces and dashes for standard processing
            cleaned = re.sub(r'[\s\-]', '', value)
            if not re.match(r'^\+?[0-9]{8,15}$', cleaned):
                raise serializers.ValidationError(
                    "Phone format is invalid. Must contain 8 to 15 digits (with optional country code)."
                )
            return cleaned
        return value


class ChangePasswordSerializer(serializers.Serializer):
    old_password = serializers.CharField(write_only=True)
    new_password = serializers.CharField(write_only=True, min_length=8)
    confirm_new_password = serializers.CharField(write_only=True, required=True)

    def validate(self, data):
        if data["new_password"] != data["confirm_new_password"]:
            raise serializers.ValidationError({"confirm_new_password": "Passwords do not match."})

        user = self.context.get("user")
        try:
            _validate_password_strength(data["new_password"], user)
        except serializers.ValidationError as exc:
            raise serializers.ValidationError({"new_password": exc.detail})
        return data


class StaffCreateSerializer(serializers.ModelSerializer):
    """Admin creates a new staff or technician account."""
    password = serializers.CharField(write_only=True, min_length=8)

    class Meta:
        model = User
        fields = ["email", "first_name", "last_name", "phone", "role", "password"]

    def validate_email(self, value):
        if User.objects.filter(email=value).exists():
            raise serializers.ValidationError("Email already in use.")
        return value.lower()

    def validate_role(self, value):
        if value == Role.ADMIN:
            raise serializers.ValidationError("Cannot create another Admin via this endpoint.")
        return value

    def validate_phone(self, value):
        import re
        if value and not re.match(r'^(\+\d{1,3}\s?)?\d{10,11}$', value):
            raise serializers.ValidationError(
                "Phone must be exactly 10 or 11 digits (with optional country code, e.g., +234)"
            )
        return value

    def validate(self, attrs):
        attrs = super().validate(attrs)
        candidate_user = User(
            email=attrs.get("email"),
            first_name=attrs.get("first_name", ""),
            last_name=attrs.get("last_name", ""),
            role=attrs.get("role", Role.STAFF),
        )
        try:
            _validate_password_strength(attrs["password"], candidate_user)
        except serializers.ValidationError as exc:
            raise serializers.ValidationError({"password": exc.detail})
        return attrs

    def create(self, validated_data):
        shop = self.context["request"].user.shop
        password = validated_data.pop("password")
        user = User(**validated_data, shop=shop)
        user.set_password(password)
        user.save()
        return user
