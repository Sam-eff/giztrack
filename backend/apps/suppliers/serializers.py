from rest_framework import serializers
from .models import Supplier, PurchaseOrder, PurchaseOrderItem


class SupplierSerializer(serializers.ModelSerializer):
    total_orders = serializers.SerializerMethodField()

    class Meta:
        model = Supplier
        fields = [
            "id", "name", "contact_person", "phone", "email",
            "address", "payment_terms", "notes", "is_active",
            "total_orders", "created_at", "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]

    def get_total_orders(self, obj):
        return obj.purchase_orders.count()


class PurchaseOrderItemSerializer(serializers.ModelSerializer):
    subtotal = serializers.ReadOnlyField()
    is_fully_received = serializers.ReadOnlyField()

    class Meta:
        model = PurchaseOrderItem
        fields = [
            "id", "product", "product_name",
            "quantity_ordered", "quantity_received", "unit_cost",
            "subtotal", "is_fully_received", "created_at",
        ]
        read_only_fields = ["id", "product_name", "created_at"]


class PurchaseOrderItemInputSerializer(serializers.Serializer):
    """Used when creating/updating a purchase order."""
    product_id = serializers.IntegerField()
    quantity_ordered = serializers.IntegerField(min_value=1)
    unit_cost = serializers.DecimalField(max_digits=12, decimal_places=2, min_value=0)


class PurchaseOrderSerializer(serializers.ModelSerializer):
    items = PurchaseOrderItemSerializer(many=True, read_only=True)
    supplier_name = serializers.SerializerMethodField()
    created_by_name = serializers.SerializerMethodField()
    status_display = serializers.SerializerMethodField()

    class Meta:
        model = PurchaseOrder
        fields = [
            "id", "supplier", "supplier_name", "order_number",
            "status", "status_display", "total_cost", "notes",
            "ordered_at", "received_at",
            "created_by", "created_by_name",
            "items", "created_at", "updated_at",
        ]
        read_only_fields = [
            "id", "order_number", "total_cost",
            "created_by", "created_at", "updated_at",
        ]

    def get_supplier_name(self, obj):
        return obj.supplier.name if obj.supplier else None

    def get_created_by_name(self, obj):
        return obj.created_by.get_full_name() if obj.created_by else None

    def get_status_display(self, obj):
        return obj.get_status_display()


class CreatePurchaseOrderSerializer(serializers.Serializer):
    """Input serializer for creating a purchase order with line items."""
    supplier_id = serializers.IntegerField()
    items = PurchaseOrderItemInputSerializer(many=True, min_length=1)
    notes = serializers.CharField(required=False, allow_blank=True)

    def validate_items(self, items):
        product_ids = [i["product_id"] for i in items]
        if len(product_ids) != len(set(product_ids)):
            raise serializers.ValidationError(
                "Duplicate products in purchase order. Combine them into one line."
            )
        return items


class ReceiveItemsSerializer(serializers.Serializer):
    """Input for receiving goods against a PO."""
    items = serializers.ListField(child=serializers.DictField(), min_length=1)
    # Each dict: { "item_id": int, "quantity_received": int, "imei_list": [...] (optional) }
