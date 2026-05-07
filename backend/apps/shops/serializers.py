from rest_framework import serializers
from .models import Shop


class ShopSerializer(serializers.ModelSerializer):
    subscription_is_active = serializers.ReadOnlyField()
    is_in_trial = serializers.ReadOnlyField()

    class Meta:
        model = Shop
        fields = [
            "id", "name", "owner_name", "email", "phone",
            "address", "logo", "is_active",
            "subscription_expires_at", "subscription_is_active",
            "is_in_trial", "enable_sms_notifications",
            "allow_staff_inventory_management", "allow_staff_sales", "created_at",
        ]
        read_only_fields = [
            "id", "email", "is_active",
            "subscription_expires_at", "created_at",
        ]


class ShopUpdateSerializer(serializers.ModelSerializer):
    """Admin can update shop details but not email or subscription fields."""

    class Meta:
        model = Shop
        fields = [
            "name", "owner_name", "phone", "address", "logo",
            "enable_sms_notifications", "allow_staff_inventory_management",
            "allow_staff_sales",
        ]

    def validate_phone(self, value):
        import re
        if value and not re.match(r'^(\+\d{1,3}\s?)?\d{10,11}$', value):
            raise serializers.ValidationError(
                "Phone must be exactly 10 or 11 digits (with optional country code, e.g., +234)"
            )
        return value
