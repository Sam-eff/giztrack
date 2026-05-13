from django.db import models


class Category(models.Model):
    shop = models.ForeignKey("shops.Shop", on_delete=models.CASCADE, related_name="categories")
    name = models.CharField(max_length=100)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ("shop", "name")
        ordering = ["name"]
        indexes = [models.Index(fields=["shop"])]

    def __str__(self):
        return self.name


class Product(models.Model):
    shop = models.ForeignKey("shops.Shop", on_delete=models.CASCADE, related_name="products")
    category = models.ForeignKey(
        Category, on_delete=models.SET_NULL, null=True, blank=True, related_name="products"
    )
    name = models.CharField(max_length=200)
    description = models.TextField(blank=True)
    cost_price = models.DecimalField(max_digits=12, decimal_places=2)
    selling_price = models.DecimalField(max_digits=12, decimal_places=2)
    brand = models.CharField(max_length=200, blank=True, null=True)
    product_model = models.CharField(max_length=200, blank=True, null=True)
    quantity = models.PositiveIntegerField(default=0)
    color = models.CharField(max_length=200, blank=True, null=True)
    low_stock_threshold = models.PositiveIntegerField(default=5)
    sku = models.CharField(max_length=100, blank=True)
    image = models.ImageField(upload_to="inventory/products/", null=True, blank=True)
    is_active = models.BooleanField(default=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["name"]
        indexes = [
            models.Index(fields=["shop"]),
            models.Index(fields=["shop", "category"]),
        ]

    def __str__(self):
        return f"{self.name} ({self.shop.name})"

    @property
    def is_low_stock(self):
        return self.quantity <= self.low_stock_threshold

    @property
    def profit_margin(self):
        if self.selling_price == 0:
            return 0
        return round(((self.selling_price - self.cost_price) / self.selling_price) * 100, 2)


class StockLog(models.Model):
    """Audit trail — every stock change is recorded here."""

    class Reason(models.TextChoices):
        PURCHASE = "purchase", "Stock Purchase"
        SALE = "sale", "Sale"
        REPAIR = "repair", "Used in Repair"
        ADJUSTMENT = "adjustment", "Manual Adjustment"
        RETURN = "return", "Customer Return"
        DAMAGE = "damage", "Damaged / Written Off"

    product = models.ForeignKey(Product, on_delete=models.CASCADE, related_name="stock_logs")
    change_amount = models.IntegerField()        # positive = added, negative = deducted
    quantity_after = models.PositiveIntegerField()  # snapshot of stock after change
    reason = models.CharField(max_length=20, choices=Reason.choices)
    note = models.CharField(max_length=255, blank=True)
    created_by = models.ForeignKey(
        "accounts.CustomUser", on_delete=models.SET_NULL, null=True, related_name="stock_logs"
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["product", "-created_at"])]

    def __str__(self):
        direction = "+" if self.change_amount > 0 else ""
        return f"{self.product.name}: {direction}{self.change_amount} ({self.reason})"


class ProductUnit(models.Model):
    """
    An individual physical unit tracked by IMEI or serial number.

    Each ProductUnit belongs to a parent Product (e.g. "iPhone 15 Pro 256GB")
    and represents one specific device with a unique identifier.  This allows
    full lifecycle tracking: Supplier → Purchase → Inventory → Sale → Customer.
    """

    class Condition(models.TextChoices):
        NEW = "new", "New"
        REFURBISHED = "refurbished", "Refurbished"
        USED = "used", "Used"

    class Status(models.TextChoices):
        IN_STOCK = "in_stock", "In Stock"
        SOLD = "sold", "Sold"
        RESERVED = "reserved", "Reserved"
        RETURNED = "returned", "Returned"
        DEFECTIVE = "defective", "Defective"

    # ── Core identifiers ─────────────────────────────────────────────────────
    product = models.ForeignKey(
        Product, on_delete=models.CASCADE, related_name="units"
    )
    imei_1 = models.CharField(
        max_length=20, blank=True, db_index=True,
        help_text="Primary IMEI (15 digits for phones)",
    )
    imei_2 = models.CharField(
        max_length=20, blank=True,
        help_text="Secondary IMEI for dual-SIM devices",
    )
    serial_number = models.CharField(
        max_length=100, blank=True, db_index=True,
        help_text="Serial number (for laptops, tablets, accessories)",
    )

    # ── Status & condition ───────────────────────────────────────────────────
    condition = models.CharField(
        max_length=20,
        choices=Condition.choices,
        default=Condition.NEW,
    )
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.IN_STOCK,
    )

    # ── Procurement linkage ──────────────────────────────────────────────────
    supplier = models.ForeignKey(
        "suppliers.Supplier",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="units_supplied",
    )
    purchase_order = models.ForeignKey(
        "suppliers.PurchaseOrder",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="units_received",
    )
    purchase_price = models.DecimalField(
        max_digits=12, decimal_places=2, null=True, blank=True,
        help_text="Actual cost paid for this specific unit",
    )

    # ── Sale linkage ─────────────────────────────────────────────────────────
    sale = models.ForeignKey(
        "sales.Sale",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="units_sold",
    )
    sold_to = models.ForeignKey(
        "customers.Customer",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="units_purchased",
    )
    sold_at = models.DateTimeField(null=True, blank=True)
    selling_price_actual = models.DecimalField(
        max_digits=12, decimal_places=2, null=True, blank=True,
        help_text="Actual price this unit was sold for",
    )

    # ── Warranty ─────────────────────────────────────────────────────────────
    warranty_months = models.PositiveIntegerField(
        default=0, help_text="Warranty duration in months from sale date"
    )

    # ── Extra ────────────────────────────────────────────────────────────────
    color = models.CharField(max_length=100, blank=True)
    storage = models.CharField(
        max_length=50, blank=True, help_text="e.g. 128GB, 256GB"
    )
    notes = models.TextField(blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["product", "status"]),
            models.Index(fields=["product", "-created_at"]),
        ]

    def __str__(self):
        identifier = self.imei_1 or self.serial_number or f"Unit #{self.id}"
        return f"{self.product.name} — {identifier} ({self.get_status_display()})"

    @property
    def identifier(self):
        """Return the primary human-readable identifier for this unit."""
        return self.imei_1 or self.serial_number or f"#{self.id}"

    @property
    def shop(self):
        """Derive shop from parent product — avoids data duplication."""
        return self.product.shop

    @property
    def warranty_is_active(self):
        """Check if this unit is still under warranty."""
        if not self.sold_at or self.warranty_months == 0:
            return False
        from django.utils import timezone
        from dateutil.relativedelta import relativedelta
        expiry = self.sold_at + relativedelta(months=self.warranty_months)
        return timezone.now() < expiry

    @property
    def warranty_expiry(self):
        """Return the warranty expiry date, or None."""
        if not self.sold_at or self.warranty_months == 0:
            return None
        from dateutil.relativedelta import relativedelta
        return self.sold_at + relativedelta(months=self.warranty_months)