from django.db import transaction
from django.db.models import Count, F, Q
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated

from utils.mixins import ShopScopedMixin
from utils.permissions import IsAdmin, IsAdminOrStaff, IsAdminOrStaffWithInventoryPerms
from .models import Category, Product, ProductUnit, StockLog
from .serializers import (
    CategorySerializer,
    ProductSerializer,
    ProductUnitSerializer,
    StockAdjustSerializer,
    StockLogSerializer,
)


class CategoryViewSet(ShopScopedMixin, viewsets.ModelViewSet):
    queryset = Category.objects.all()
    serializer_class = CategorySerializer

    def get_permissions(self):
        if self.action in ("create", "update", "partial_update", "destroy"):
            return [IsAuthenticated(), IsAdminOrStaffWithInventoryPerms()]
        return [IsAuthenticated()]


class ProductViewSet(ShopScopedMixin, viewsets.ModelViewSet):
    queryset = Product.objects.select_related("category").all()
    serializer_class = ProductSerializer

    def serialize_product(self, product):
        refreshed = self.get_queryset().get(pk=product.pk)
        return self.get_serializer(refreshed).data

    def get_queryset(self):
        tracked_stock_statuses = [
            ProductUnit.Status.IN_STOCK,
            ProductUnit.Status.RETURNED,
            ProductUnit.Status.RESERVED,
            ProductUnit.Status.DEFECTIVE,
        ]
        tracked_available_statuses = [
            ProductUnit.Status.IN_STOCK,
            ProductUnit.Status.RETURNED,
        ]

        qs = super().get_queryset().filter(is_active=True).annotate(
            tracked_units_count=Count("units", distinct=True),
            tracked_in_stock_count=Count(
                "units",
                filter=Q(units__status__in=tracked_available_statuses),
                distinct=True,
            ),
            tracked_available_count=Count(
                "units",
                filter=Q(units__status__in=tracked_available_statuses),
                distinct=True,
            ),
            tracked_stock_count=Count(
                "units",
                filter=Q(units__status__in=tracked_stock_statuses),
                distinct=True,
            ),
            tracked_sold_count=Count(
                "units",
                filter=Q(units__status=ProductUnit.Status.SOLD),
                distinct=True,
            ),
        )
        category = self.request.query_params.get("category")
        search = self.request.query_params.get("search")
        if category:
            qs = qs.filter(category_id=category)
        if search:
            qs = qs.filter(
                Q(name__icontains=search) |
                Q(sku__icontains=search) |
                Q(brand__icontains=search) |
                Q(product_model__icontains=search) |
                Q(description__icontains=search)
            )
        return qs

    def get_permissions(self):
        if self.action in ("create", "update", "partial_update", "destroy"):
            return [IsAuthenticated(), IsAdminOrStaffWithInventoryPerms()]
        return [IsAuthenticated()]

    def create(self, request, *args, **kwargs):
        shop = request.user.shop
        if not shop.can_add_product():
            plan = shop.effective_plan_for_limits
            limit = shop.product_limit
            return Response(
                {
                    "detail": (
                        f"Your {(plan.name if plan else 'current')} plan allows up to "
                        f"{limit} active product(s). Remove an old item or upgrade your plan to add more."
                    )
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        return super().create(request, *args, **kwargs)

    def destroy(self, request, *args, **kwargs):
        product = self.get_object()
        product.is_active = False
        product.save()
        return Response({"message": "Product removed from inventory."}, status=status.HTTP_200_OK)

    @action(detail=False, methods=["get"], url_path="low-stock")
    def low_stock(self, request):
        """Products at or below their individual low_stock_threshold."""
        qs = self.get_queryset().filter(quantity__lte=F("low_stock_threshold"))
        serializer = self.get_serializer(qs, many=True)
        return Response({"count": qs.count(), "results": serializer.data})

    @action(detail=False, methods=["get"], url_path="summary")
    def summary(self, request):
        from django.db.models import Sum
        qs = self.get_queryset()
        totals = qs.aggregate(
            total_value=Sum(F('quantity') * F('selling_price')),
            total_cost=Sum(F('quantity') * F('cost_price'))
        )
        return Response({
            "total_value": totals["total_value"] or 0,
            "total_cost": totals["total_cost"] or 0,
        })

    @action(
        detail=True, methods=["post"], url_path="adjust-stock",
        permission_classes=[IsAuthenticated, IsAdminOrStaffWithInventoryPerms],
    )
    def adjust_stock(self, request, pk=None):
        product = self.get_object()
        serializer = StockAdjustSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        change = serializer.validated_data["change_amount"]
        new_quantity = product.quantity + change

        if new_quantity < 0:
            return Response(
                {"error": f"Cannot reduce stock below zero. Current stock: {product.quantity}"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        with transaction.atomic():
            product.quantity = new_quantity
            product.save()
            StockLog.objects.create(
                product=product,
                change_amount=change,
                quantity_after=new_quantity,
                reason=serializer.validated_data["reason"],
                note=serializer.validated_data.get("note", ""),
                created_by=request.user,
            )

        return Response({
            "message": "Stock updated.",
            "product": self.serialize_product(product),
            "new_quantity": new_quantity,
        })

    @action(detail=True, methods=["get"], url_path="stock-history")
    def stock_history(self, request, pk=None):
        product = self.get_object()
        logs = StockLog.objects.filter(product=product).select_related("created_by")
        serializer = StockLogSerializer(logs, many=True)
        return Response(serializer.data)


class StockLogViewSet(viewsets.ReadOnlyModelViewSet):
    """Global view of all stock movements for the shop."""
    serializer_class = StockLogSerializer
    permission_classes = [IsAuthenticated, IsAdminOrStaff]

    def get_queryset(self):
        return StockLog.objects.filter(
            product__shop=self.request.user.shop
        ).select_related("product", "created_by")


class ProductUnitViewSet(viewsets.ModelViewSet):
    """CRUD for individual IMEI/serial-tracked units."""
    serializer_class = ProductUnitSerializer
    permission_classes = [IsAuthenticated, IsAdminOrStaffWithInventoryPerms]

    def get_queryset(self):
        return ProductUnit.objects.filter(
            product__shop=self.request.user.shop
        ).select_related(
            "product", "supplier", "purchase_order", "sale", "sold_to"
        )

    def get_filtered_queryset(self):
        qs = self.get_queryset()
        search = self.request.query_params.get("search")
        product_id = self.request.query_params.get("product")
        status_filter = self.request.query_params.get("status")
        condition = self.request.query_params.get("condition")
        supplier_id = self.request.query_params.get("supplier")

        if search:
            from django.db.models import Q
            qs = qs.filter(
                Q(imei_1__icontains=search)
                | Q(imei_2__icontains=search)
                | Q(serial_number__icontains=search)
                | Q(product__name__icontains=search)
            )
        if product_id:
            qs = qs.filter(product_id=product_id)
        if status_filter:
            statuses = [status.strip() for status in status_filter.split(",") if status.strip()]
            qs = qs.filter(status__in=statuses)
        if condition:
            qs = qs.filter(condition=condition)
        if supplier_id:
            qs = qs.filter(supplier_id=supplier_id)
        return qs

    def list(self, request, *args, **kwargs):
        qs = self.get_filtered_queryset()
        page = self.paginate_queryset(qs)
        if page is not None:
            serializer = self.get_serializer(page, many=True)
            return self.get_paginated_response(serializer.data)
        serializer = self.get_serializer(qs, many=True)
        return Response(serializer.data)

    def perform_create(self, serializer):
        # Validate product belongs to user's shop
        product = serializer.validated_data.get("product")
        if product and product.shop != self.request.user.shop:
            from rest_framework.exceptions import ValidationError
            raise ValidationError("Product does not belong to your shop.")
        serializer.save()

    @action(detail=False, methods=["get"], url_path="lookup")
    def lookup_by_imei(self, request):
        """
        Look up a unit by IMEI or serial number.
        Usage: GET /inventory/units/lookup/?imei=353456789012345
        """
        imei = request.query_params.get("imei", "").strip()
        serial = request.query_params.get("serial", "").strip()

        if not imei and not serial:
            return Response(
                {"error": "Provide ?imei= or ?serial= to search."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        qs = self.get_queryset()
        if imei:
            from django.db.models import Q
            qs = qs.filter(Q(imei_1=imei) | Q(imei_2=imei) | Q(serial_number=imei))
        elif serial:
            qs = qs.filter(serial_number=serial)

        unit = qs.first()
        if not unit:
            return Response(
                {"error": "No unit found with that identifier."},
                status=status.HTTP_404_NOT_FOUND,
            )

        return Response(self.get_serializer(unit).data)

    @action(detail=False, methods=["get"], url_path="summary")
    def summary(self, request):
        """Summary counts by status for the shop."""
        qs = self.get_queryset()
        from django.db.models import Count
        by_status = (
            qs.values("status")
            .annotate(count=Count("id"))
            .order_by("status")
        )
        return Response({
            "total": qs.count(),
            "by_status": {item["status"]: item["count"] for item in by_status},
        })
