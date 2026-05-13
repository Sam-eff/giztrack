from django.db import models


class Supplier(models.Model):
    """Vendor / supplier that the shop buys inventory from."""

    shop = models.ForeignKey(
        "shops.Shop", on_delete=models.CASCADE, related_name="suppliers"
    )
    name = models.CharField(max_length=200)
    contact_person = models.CharField(max_length=200, blank=True)
    phone = models.CharField(max_length=30, blank=True)
    email = models.EmailField(blank=True)
    address = models.TextField(blank=True)
    payment_terms = models.CharField(
        max_length=100,
        blank=True,
        help_text="e.g. Cash on Delivery, Net 30, etc.",
    )
    notes = models.TextField(blank=True)
    is_active = models.BooleanField(default=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["name"]
        indexes = [
            models.Index(fields=["shop"]),
            models.Index(fields=["shop", "name"]),
        ]

    def __str__(self):
        return f"{self.name} ({self.shop.name})"


class PurchaseOrder(models.Model):
    """A purchase order for goods from a supplier."""

    class Status(models.TextChoices):
        DRAFT = "draft", "Draft"
        ORDERED = "ordered", "Ordered"
        PARTIALLY_RECEIVED = "partially_received", "Partially Received"
        RECEIVED = "received", "Received"
        CANCELLED = "cancelled", "Cancelled"

    shop = models.ForeignKey(
        "shops.Shop", on_delete=models.CASCADE, related_name="purchase_orders"
    )
    supplier = models.ForeignKey(
        Supplier, on_delete=models.CASCADE, related_name="purchase_orders"
    )
    order_number = models.CharField(
        max_length=50,
        blank=True,
        help_text="Auto-generated if left blank.",
    )
    status = models.CharField(
        max_length=30,
        choices=Status.choices,
        default=Status.DRAFT,
    )
    total_cost = models.DecimalField(
        max_digits=14, decimal_places=2, default=0
    )
    notes = models.TextField(blank=True)
    ordered_at = models.DateTimeField(null=True, blank=True)
    received_at = models.DateTimeField(null=True, blank=True)
    created_by = models.ForeignKey(
        "accounts.CustomUser",
        on_delete=models.SET_NULL,
        null=True,
        related_name="purchase_orders_created",
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["shop", "-created_at"]),
            models.Index(fields=["shop", "status"]),
            models.Index(fields=["shop", "supplier"]),
        ]

    def __str__(self):
        return f"PO #{self.order_number or self.id} — {self.supplier.name}"

    def save(self, *args, **kwargs):
        created = self._state.adding
        super().save(*args, **kwargs)
        if created and not self.order_number:
            self.order_number = f"PO-{self.id:05d}"
            super().save(update_fields=["order_number"])

    def recalculate_total(self):
        """Recalculate total_cost from line items."""
        from django.db.models import F, Sum

        total = (
            self.items.aggregate(
                total=Sum(F("quantity_ordered") * F("unit_cost"))
            )["total"]
            or 0
        )
        self.total_cost = total
        self.save(update_fields=["total_cost"])


class PurchaseOrderItem(models.Model):
    """Line item on a purchase order — one row per product type."""

    purchase_order = models.ForeignKey(
        PurchaseOrder, on_delete=models.CASCADE, related_name="items"
    )
    product = models.ForeignKey(
        "inventory.Product",
        on_delete=models.SET_NULL,
        null=True,
        related_name="purchase_order_items",
    )
    product_name = models.CharField(max_length=200)  # snapshot
    quantity_ordered = models.PositiveIntegerField(default=1)
    quantity_received = models.PositiveIntegerField(default=0)
    unit_cost = models.DecimalField(max_digits=12, decimal_places=2)

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["id"]

    def __str__(self):
        return f"{self.product_name} x{self.quantity_ordered} (PO #{self.purchase_order_id})"

    @property
    def subtotal(self):
        return self.unit_cost * self.quantity_ordered

    @property
    def is_fully_received(self):
        return self.quantity_received >= self.quantity_ordered
