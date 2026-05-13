from django.db import models, transaction
from django.utils import timezone
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated

from utils.mixins import ShopScopedMixin
from utils.permissions import IsAdminOrStaffWithInventoryPerms
from apps.inventory.models import Product, ProductUnit, StockLog
from .models import Supplier, PurchaseOrder, PurchaseOrderItem
from .serializers import (
    SupplierSerializer,
    PurchaseOrderSerializer,
    CreatePurchaseOrderSerializer,
    ReceiveItemsSerializer,
)


class SupplierViewSet(ShopScopedMixin, viewsets.ModelViewSet):
    queryset = Supplier.objects.all()
    serializer_class = SupplierSerializer

    def get_permissions(self):
        if self.action in ("create", "update", "partial_update", "destroy"):
            return [IsAuthenticated(), IsAdminOrStaffWithInventoryPerms()]
        return [IsAuthenticated()]

    def get_queryset(self):
        qs = super().get_queryset().filter(is_active=True)
        search = self.request.query_params.get("search")
        if search:
            from django.db.models import Q
            qs = qs.filter(
                Q(name__icontains=search)
                | Q(contact_person__icontains=search)
                | Q(phone__icontains=search)
                | Q(email__icontains=search)
            )
        return qs

    def destroy(self, request, *args, **kwargs):
        supplier = self.get_object()
        supplier.is_active = False
        supplier.save(update_fields=["is_active"])
        return Response(
            {"message": "Supplier archived."},
            status=status.HTTP_200_OK,
        )


class PurchaseOrderViewSet(ShopScopedMixin, viewsets.ModelViewSet):
    queryset = PurchaseOrder.objects.select_related(
        "supplier", "created_by"
    ).prefetch_related("items__product")
    serializer_class = PurchaseOrderSerializer

    def get_permissions(self):
        return [IsAuthenticated(), IsAdminOrStaffWithInventoryPerms()]

    def get_queryset(self):
        qs = super().get_queryset()
        supplier_id = self.request.query_params.get("supplier")
        status_filter = self.request.query_params.get("status")
        if supplier_id:
            qs = qs.filter(supplier_id=supplier_id)
        if status_filter:
            qs = qs.filter(status=status_filter)
        return qs

    def create(self, request, *args, **kwargs):
        serializer = CreatePurchaseOrderSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        shop = request.user.shop

        # Validate supplier belongs to this shop
        try:
            supplier = Supplier.objects.get(
                id=data["supplier_id"], shop=shop, is_active=True
            )
        except Supplier.DoesNotExist:
            return Response(
                {"error": "Supplier not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        with transaction.atomic():
            po = PurchaseOrder.objects.create(
                shop=shop,
                supplier=supplier,
                notes=data.get("notes", ""),
                created_by=request.user,
                status=PurchaseOrder.Status.DRAFT,
            )

            for item_data in data["items"]:
                try:
                    product = Product.objects.get(
                        id=item_data["product_id"], shop=shop, is_active=True
                    )
                except Product.DoesNotExist:
                    return Response(
                        {"error": f"Product ID {item_data['product_id']} not found."},
                        status=status.HTTP_404_NOT_FOUND,
                    )

                PurchaseOrderItem.objects.create(
                    purchase_order=po,
                    product=product,
                    product_name=product.name,
                    quantity_ordered=item_data["quantity_ordered"],
                    unit_cost=item_data["unit_cost"],
                )

            po.recalculate_total()

        # Refetch with relations
        po = self.get_queryset().get(pk=po.pk)
        return Response(
            {
                "message": "Purchase order created.",
                "purchase_order": PurchaseOrderSerializer(po).data,
            },
            status=status.HTTP_201_CREATED,
        )

    @action(detail=True, methods=["post"], url_path="mark-ordered")
    def mark_ordered(self, request, pk=None):
        po = self.get_object()
        if po.status != PurchaseOrder.Status.DRAFT:
            return Response(
                {"error": "Only draft orders can be marked as ordered."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        po.status = PurchaseOrder.Status.ORDERED
        po.ordered_at = timezone.now()
        po.save(update_fields=["status", "ordered_at"])
        return Response({
            "message": "Purchase order marked as ordered.",
            "purchase_order": PurchaseOrderSerializer(
                self.get_queryset().get(pk=po.pk)
            ).data,
        })

    @action(detail=True, methods=["post"], url_path="receive")
    def receive_items(self, request, pk=None):
        """
        Receive goods against a purchase order.
        For each item, optionally provide IMEI/serial numbers to create
        individual ProductUnit records.
        """
        po = self.get_object()

        if po.status in (
            PurchaseOrder.Status.CANCELLED,
            PurchaseOrder.Status.DRAFT,
        ):
            return Response(
                {"error": "Cannot receive items for a draft or cancelled order."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        serializer = ReceiveItemsSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        with transaction.atomic():
            all_fully_received = True

            for receive_data in serializer.validated_data["items"]:
                item_id = receive_data.get("item_id")
                qty_received = receive_data.get("quantity_received", 0)
                imei_list = receive_data.get("imei_list", [])

                if not item_id or qty_received <= 0:
                    continue

                try:
                    poi = PurchaseOrderItem.objects.select_for_update().get(
                        id=item_id, purchase_order=po
                    )
                except PurchaseOrderItem.DoesNotExist:
                    continue

                remaining = poi.quantity_ordered - poi.quantity_received
                actual_received = min(qty_received, remaining)
                if actual_received <= 0:
                    continue

                poi.quantity_received += actual_received
                poi.save(update_fields=["quantity_received"])

                # Update product aggregate stock
                if poi.product:
                    product = Product.objects.select_for_update().get(
                        pk=poi.product_id
                    )
                    product.quantity += actual_received
                    product.save(update_fields=["quantity"])

                    StockLog.objects.create(
                        product=product,
                        change_amount=actual_received,
                        quantity_after=product.quantity,
                        reason=StockLog.Reason.PURCHASE,
                        note=f"Received from PO #{po.order_number}",
                        created_by=request.user,
                    )

                    # Create ProductUnit records for IMEI-tracked items
                    for imei_entry in imei_list[:actual_received]:
                        if isinstance(imei_entry, str):
                            code = imei_entry.strip()
                            imei_entry = (
                                {"imei_1": code}
                                if code.isdigit() and 14 <= len(code) <= 17
                                else {"serial_number": code}
                            )

                        ProductUnit.objects.create(
                            product=product,
                            imei_1=imei_entry.get("imei_1", ""),
                            imei_2=imei_entry.get("imei_2", ""),
                            serial_number=imei_entry.get("serial_number", ""),
                            condition=imei_entry.get("condition", ProductUnit.Condition.NEW),
                            status=ProductUnit.Status.IN_STOCK,
                            supplier=po.supplier,
                            purchase_order=po,
                            purchase_price=poi.unit_cost,
                            color=imei_entry.get("color", ""),
                            storage=imei_entry.get("storage", ""),
                            notes=imei_entry.get("notes", ""),
                        )

                if not poi.is_fully_received:
                    all_fully_received = False

            # Check all items to determine final PO status
            if all_fully_received:
                still_pending = po.items.filter(
                    quantity_received__lt=models.F("quantity_ordered")
                ).exists()
                if still_pending:
                    po.status = PurchaseOrder.Status.PARTIALLY_RECEIVED
                else:
                    po.status = PurchaseOrder.Status.RECEIVED
                    po.received_at = timezone.now()
            else:
                po.status = PurchaseOrder.Status.PARTIALLY_RECEIVED

            po.save(update_fields=["status", "received_at"])

        po = self.get_queryset().get(pk=po.pk)
        return Response({
            "message": "Items received successfully.",
            "purchase_order": PurchaseOrderSerializer(po).data,
        })

    @action(detail=True, methods=["post"], url_path="cancel")
    def cancel(self, request, pk=None):
        po = self.get_object()
        if po.status == PurchaseOrder.Status.RECEIVED:
            return Response(
                {"error": "Cannot cancel a fully received order."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        po.status = PurchaseOrder.Status.CANCELLED
        po.save(update_fields=["status"])
        return Response({
            "message": "Purchase order cancelled.",
            "purchase_order": PurchaseOrderSerializer(
                self.get_queryset().get(pk=po.pk)
            ).data,
        })
