from decimal import Decimal

from rest_framework import serializers
from apps.inventory.models import Product
from apps.customers.models import Customer
from .models import Sale, SaleItem, SalePayment


class SaleItemInputSerializer(serializers.Serializer):
    """Used when creating a sale — supports both inventory products and custom items."""
    product_id = serializers.IntegerField(required=False, allow_null=True)
    quantity = serializers.IntegerField(min_value=1)
    custom_price = serializers.DecimalField(max_digits=12, decimal_places=2, required=False, allow_null=True, min_value=0)
    unit_ids = serializers.ListField(
        child=serializers.IntegerField(), required=False, allow_empty=True,
        help_text="IDs of specific ProductUnit records (IMEIs) being sold."
    )

    # Optional fields for custom items
    product_name = serializers.CharField(max_length=200, required=False, allow_blank=True)
    unit_price = serializers.DecimalField(max_digits=12, decimal_places=2, required=False, min_value=0)


class SaleItemSerializer(serializers.ModelSerializer):
    subtotal = serializers.ReadOnlyField()
    profit = serializers.ReadOnlyField()
    product_image = serializers.SerializerMethodField()
    sold_units = serializers.SerializerMethodField()

    class Meta:
        model = SaleItem
        fields = [
            "id", "product", "product_name", "product_image",
            "quantity", "unit_price", "unit_cost",
            "is_custom", "subtotal", "profit", "returned_quantity",
            "sold_units",
        ]

    def get_product_image(self, obj):
        request = self.context.get("request")
        if obj.product and obj.product.image:
            return request.build_absolute_uri(obj.product.image.url) if request else obj.product.image.url
        return None

    def get_sold_units(self, obj):
        if not obj.product_id:
            return []

        units = obj.sale.units_sold.filter(product_id=obj.product_id)
        return [
            {
                "id": unit.id,
                "identifier": unit.identifier,
                "imei_1": unit.imei_1,
                "imei_2": unit.imei_2,
                "serial_number": unit.serial_number,
                "status": unit.status,
                "status_display": unit.get_status_display(),
                "supplier_name": unit.supplier.name if unit.supplier else None,
                "warranty_months": unit.warranty_months,
                "warranty_expiry": unit.warranty_expiry,
                "condition": unit.condition,
                "condition_display": unit.get_condition_display(),
                "color": unit.color,
                "storage": unit.storage,
            }
            for unit in units
        ]


class SalePaymentSerializer(serializers.ModelSerializer):
    received_by_name = serializers.SerializerMethodField()

    class Meta:
        model = SalePayment
        fields = ["id", "amount", "note", "received_by", "received_by_name", "created_at"]

    def get_received_by_name(self, obj):
        return obj.received_by.get_full_name() if obj.received_by else None


class SaleSerializer(serializers.ModelSerializer):
    items = SaleItemSerializer(many=True, read_only=True)
    payments = SalePaymentSerializer(many=True, read_only=True)
    customer_name = serializers.SerializerMethodField()
    staff_name = serializers.SerializerMethodField()
    balance_owed = serializers.SerializerMethodField()

    class Meta:
        model = Sale
        fields = [
            "id", "customer", "customer_name",
            "staff", "staff_name",
            "items", "total_amount", "total_profit",
            "discount_amount", "amount_paid", "is_credit",
            "balance_owed", "payments", "note", "created_at",
        ]

    def get_customer_name(self, obj):
        return obj.customer.name if obj.customer else "Walk-in"

    def get_staff_name(self, obj):
        return obj.staff.get_full_name() if obj.staff else None

    def get_balance_owed(self, obj):
        return str(obj.balance_owed)


class CreateSaleSerializer(serializers.Serializer):
    """
    Input serializer for the POS sale creation endpoint.
    Handles validation before the atomic transaction runs.
    """
    items = SaleItemInputSerializer(many=True, min_length=1)
    customer_phone = serializers.CharField(max_length=20, required=False, allow_blank=True)
    customer_name = serializers.CharField(max_length=200, required=False, allow_blank=True)
    discount_amount = serializers.DecimalField(max_digits=12, decimal_places=2, required=False, min_value=0)
    note = serializers.CharField(required=False, allow_blank=True)
    # Credit sale fields
    is_credit = serializers.BooleanField(required=False, default=False)
    amount_paid = serializers.DecimalField(max_digits=12, decimal_places=2, required=False, min_value=0)

    def validate_items(self, items):
        product_ids = [i["product_id"] for i in items if i.get("product_id") is not None]
        if len(product_ids) != len(set(product_ids)):
            raise serializers.ValidationError("Duplicate products in sale. Combine them into one line.")
        
        # Verify custom items have required fields
        for item in items:
            if item.get("product_id") is None:
                if not item.get("product_name") or item.get("unit_price") is None:
                    raise serializers.ValidationError("Custom items require both a product_name and unit_price.")
                    
        return items


class RecordSalePaymentSerializer(serializers.Serializer):
    amount = serializers.DecimalField(
        max_digits=12,
        decimal_places=2,
        min_value=Decimal("0.01"),
    )
    note = serializers.CharField(max_length=255, required=False, allow_blank=True)
