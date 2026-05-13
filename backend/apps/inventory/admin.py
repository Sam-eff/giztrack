from django.contrib import admin
from .models import Category, Product, ProductUnit, StockLog


@admin.register(Category)
class CategoryAdmin(admin.ModelAdmin):
    list_display = ["name", "shop", "created_at"]
    list_filter = ["shop"]
    search_fields = ["name"]


@admin.register(Product)
class ProductAdmin(admin.ModelAdmin):
    list_display = [
        "name", "shop", "category", "cost_price",
        "selling_price", "brand", "product_model", "color", "quantity", "low_stock_threshold", "is_active"
    ]
    list_filter = ["shop", "category", "is_active"]
    search_fields = ["name", "sku"]
    readonly_fields = ["created_at", "updated_at"]


@admin.register(ProductUnit)
class ProductUnitAdmin(admin.ModelAdmin):
    list_display = [
        "identifier", "product", "status", "condition",
        "supplier", "sold_to", "sold_at", "created_at",
    ]
    list_filter = ["status", "condition"]
    search_fields = ["imei_1", "imei_2", "serial_number", "product__name"]
    readonly_fields = ["created_at", "updated_at"]
    raw_id_fields = ["product", "supplier", "purchase_order", "sale", "sold_to"]


@admin.register(StockLog)
class StockLogAdmin(admin.ModelAdmin):
    list_display = ["product", "change_amount", "quantity_after", "reason", "created_by", "created_at"]
    list_filter = ["reason"]
    search_fields = ["product__name"]
    readonly_fields = ["created_at"]