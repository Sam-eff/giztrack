from django.contrib import admin
from .models import Supplier, PurchaseOrder, PurchaseOrderItem


class PurchaseOrderItemInline(admin.TabularInline):
    model = PurchaseOrderItem
    extra = 0
    readonly_fields = ["product_name", "unit_cost", "quantity_received", "created_at"]


@admin.register(Supplier)
class SupplierAdmin(admin.ModelAdmin):
    list_display = ["name", "shop", "contact_person", "phone", "email", "is_active", "created_at"]
    list_filter = ["shop", "is_active"]
    search_fields = ["name", "contact_person", "phone", "email"]
    readonly_fields = ["created_at", "updated_at"]


@admin.register(PurchaseOrder)
class PurchaseOrderAdmin(admin.ModelAdmin):
    list_display = [
        "order_number", "shop", "supplier", "status",
        "total_cost", "created_by", "created_at",
    ]
    list_filter = ["shop", "status"]
    search_fields = ["order_number", "supplier__name"]
    readonly_fields = ["order_number", "total_cost", "created_at", "updated_at"]
    inlines = [PurchaseOrderItemInline]
