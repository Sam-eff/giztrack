from rest_framework import serializers
from .models import Category, Product, ProductUnit, StockLog


class CategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = Category
        fields = ["id", "name", "created_at"]
        read_only_fields = ["id", "created_at"]


class ProductSerializer(serializers.ModelSerializer):
    TRACKED_STOCK_STATUSES = [
        ProductUnit.Status.IN_STOCK,
        ProductUnit.Status.RETURNED,
        ProductUnit.Status.RESERVED,
        ProductUnit.Status.DEFECTIVE,
    ]
    TRACKED_AVAILABLE_STATUSES = [
        ProductUnit.Status.IN_STOCK,
        ProductUnit.Status.RETURNED,
    ]

    category = serializers.PrimaryKeyRelatedField(
        queryset=Category.objects.none(),
        required=False,
        allow_null=True,
    )
    category_name = serializers.SerializerMethodField()
    is_low_stock = serializers.ReadOnlyField()
    profit_margin = serializers.ReadOnlyField()
    tracked_units_count = serializers.SerializerMethodField()
    tracked_in_stock_count = serializers.SerializerMethodField()
    tracked_available_count = serializers.SerializerMethodField()
    tracked_stock_count = serializers.SerializerMethodField()
    tracked_sold_count = serializers.SerializerMethodField()
    untracked_stock_count = serializers.SerializerMethodField()

    class Meta:
        model = Product
        fields = [
            "id", "name", "description", "sku",
            "category", "category_name",
            "cost_price", "selling_price", "profit_margin", "brand", "product_model", "color",
            "quantity", "low_stock_threshold", "is_low_stock",
            "tracked_units_count", "tracked_in_stock_count", "tracked_available_count",
            "tracked_stock_count", "tracked_sold_count", "untracked_stock_count",
            "image", "is_active", "created_at", "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]

    def get_category_name(self, obj):
        return obj.category.name if obj.category else None

    def _get_unit_count(self, obj, annotated_name, **filters):
        value = getattr(obj, annotated_name, None)
        if value is not None:
            return value
        return obj.units.filter(**filters).count() if filters else obj.units.count()

    def get_tracked_units_count(self, obj):
        return self._get_unit_count(obj, "tracked_units_count")

    def get_tracked_in_stock_count(self, obj):
        return self.get_tracked_available_count(obj)

    def get_tracked_available_count(self, obj):
        return self._get_unit_count(
            obj,
            "tracked_available_count",
            status__in=self.TRACKED_AVAILABLE_STATUSES,
        )

    def get_tracked_stock_count(self, obj):
        return self._get_unit_count(
            obj,
            "tracked_stock_count",
            status__in=self.TRACKED_STOCK_STATUSES,
        )

    def get_tracked_sold_count(self, obj):
        return self._get_unit_count(
            obj,
            "tracked_sold_count",
            status=ProductUnit.Status.SOLD,
        )

    def get_untracked_stock_count(self, obj):
        tracked_stock = self.get_tracked_stock_count(obj)
        return max((obj.quantity or 0) - tracked_stock, 0)

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        request = self.context.get("request")
        if request and request.user and request.user.is_authenticated:
            self.fields["category"].queryset = Category.objects.filter(shop=request.user.shop)

    def validate(self, data):
        cost = data.get("cost_price", getattr(self.instance, "cost_price", None))
        selling = data.get("selling_price", getattr(self.instance, "selling_price", None))
        if cost and selling and selling < cost:
            raise serializers.ValidationError(
                {"selling_price": "Selling price cannot be lower than cost price."}
            )
        return data


class StockAdjustSerializer(serializers.Serializer):
    """Used for manual stock adjustments by admin/staff."""
    change_amount = serializers.IntegerField()
    reason = serializers.ChoiceField(choices=StockLog.Reason.choices)
    note = serializers.CharField(max_length=255, required=False, allow_blank=True)

    def validate_change_amount(self, value):
        if value == 0:
            raise serializers.ValidationError("Change amount cannot be zero.")
        return value


class StockLogSerializer(serializers.ModelSerializer):
    product_name = serializers.SerializerMethodField()
    created_by_name = serializers.SerializerMethodField()
    reason_display = serializers.SerializerMethodField()

    class Meta:
        model = StockLog
        fields = [
            "id", "product", "product_name", "change_amount",
            "quantity_after", "reason", "reason_display", "note",
            "created_by", "created_by_name", "created_at",
        ]

    def get_product_name(self, obj):
        return obj.product.name

    def get_created_by_name(self, obj):
        return obj.created_by.get_full_name() if obj.created_by else None

    def get_reason_display(self, obj):
        return obj.get_reason_display()


class ProductUnitSerializer(serializers.ModelSerializer):
    """Full representation of an individual IMEI/serial-tracked unit."""
    product_name = serializers.SerializerMethodField()
    supplier_name = serializers.SerializerMethodField()
    sold_to_name = serializers.SerializerMethodField()
    condition_display = serializers.CharField(
        source="get_condition_display", read_only=True
    )
    status_display = serializers.CharField(
        source="get_status_display", read_only=True
    )
    warranty_is_active = serializers.ReadOnlyField()
    warranty_expiry = serializers.ReadOnlyField()
    identifier = serializers.ReadOnlyField()

    class Meta:
        model = ProductUnit
        fields = [
            "id", "product", "product_name",
            "imei_1", "imei_2", "serial_number",
            "condition", "condition_display",
            "status", "status_display",
            "supplier", "supplier_name",
            "purchase_order", "purchase_price",
            "sale", "sold_to", "sold_to_name",
            "sold_at", "selling_price_actual",
            "warranty_months", "warranty_is_active", "warranty_expiry",
            "color", "storage", "notes", "identifier",
            "created_at", "updated_at",
        ]
        read_only_fields = [
            "id", "sale", "sold_to", "sold_at",
            "selling_price_actual", "created_at", "updated_at",
        ]

    def get_product_name(self, obj):
        return obj.product.name if obj.product else None

    def get_supplier_name(self, obj):
        return obj.supplier.name if obj.supplier else None

    def get_sold_to_name(self, obj):
        return obj.sold_to.name if obj.sold_to else None

    def validate(self, data):
        # At least one identifier is required
        imei_1 = data.get("imei_1", getattr(self.instance, "imei_1", ""))
        serial = data.get("serial_number", getattr(self.instance, "serial_number", ""))
        if not imei_1 and not serial:
            raise serializers.ValidationError(
                "At least one identifier is required: IMEI or serial number."
            )
        return data
