from django.db import transaction
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated

from utils.mixins import ShopScopedMixin
from utils.permissions import IsAdmin, IsAdminOrStaff, IsAdminOrTechnician
from apps.inventory.models import Product, StockLog
from apps.customers.models import Customer
from .models import RepairTicket, RepairPart
from .serializers import (
    RepairTicketSerializer,
    CreateRepairTicketSerializer,
    UpdateStatusSerializer,
    AddPartSerializer,
    CollectPaymentSerializer,
)


class RepairTicketViewSet(ShopScopedMixin, viewsets.ModelViewSet):
    queryset = RepairTicket.objects.select_related(
        "customer", "technician"
    ).prefetch_related("parts__product")
    serializer_class = RepairTicketSerializer
    http_method_names = ["get", "post", "head", "options"]

    def get_permissions(self):
        if self.action in ("create", "destroy"):
            return [IsAuthenticated(), IsAdminOrStaff()]
        return [IsAuthenticated()]

    def serialize_ticket(self, ticket):
        fresh_ticket = self.get_queryset().get(pk=ticket.pk)
        return RepairTicketSerializer(fresh_ticket).data

    def get_queryset(self):
        qs = super().get_queryset()
        status_filter = self.request.query_params.get("status")
        tech_id = self.request.query_params.get("technician")

        # Technicians only see their own assigned repairs
        if self.request.user.is_technician:
            qs = qs.filter(technician=self.request.user)

        if status_filter:
            qs = qs.filter(status=status_filter)
        if tech_id:
            qs = qs.filter(technician_id=tech_id)

        return qs

    def create(self, request, *args, **kwargs):
        serializer = CreateRepairTicketSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        shop = request.user.shop

        with transaction.atomic():
            # Resolve or create customer
            customer, _ = Customer.objects.get_or_create(
                shop=shop,
                phone=data["customer_phone"],
                defaults={"name": data["customer_name"]},
            )

            ticket = RepairTicket.objects.create(
                shop=shop,
                customer=customer,
                technician=data.get("technician"),
                device_type=data["device_type"],
                device_model=data["device_model"],
                issue_description=data["issue_description"],
                estimated_cost=data.get("estimated_cost", 0),
                note=data.get("note", ""),
                image=data.get("image"),
            )

        return Response(
            {
                "message": "Repair ticket created.",
                "ticket": self.serialize_ticket(ticket),
            },
            status=status.HTTP_201_CREATED,
        )

    @action(detail=True, methods=["post"], url_path="update-status")
    def update_status(self, request, pk=None):
        ticket = self.get_object()
        serializer = UpdateStatusSerializer(
            data=request.data,
            context={"ticket": ticket},
        )
        serializer.is_valid(raise_exception=True)

        new_status = serializer.validated_data["status"]
        note = serializer.validated_data.get("note", "")

        ticket.status = new_status
        if note:
            ticket.note = (ticket.note + f"\n[{new_status}] {note}").strip()
        ticket.save()

        # Notify customer when repair is ready for pickup
        if new_status == RepairTicket.Status.FIXED:
            from django_q.tasks import async_task

            transaction.on_commit(
                lambda: async_task(
                    "apps.notifications.tasks.notify_repair_ready",
                    ticket.id,
                )
            )

        return Response({
            "message": f"Status updated to '{ticket.get_status_display()}'.",
            "ticket": self.serialize_ticket(ticket),
        })

    @action(detail=False, methods=["get"], url_path="summary")
    def summary(self, request):
        from django.db.models import Sum, F, ExpressionWrapper, DecimalField

        qs = self.get_queryset()

        # Total Revenue: sum of all amount_paid
        revenue_agg = qs.aggregate(revenue=Sum("amount_paid"))
        total_revenue = revenue_agg["revenue"] or 0

        # Total Expenses: sum of (quantity_used * unit_cost) for parts connected to these tickets
        expense_agg = RepairPart.objects.filter(ticket__in=qs).aggregate(
            expense=Sum(
                ExpressionWrapper(
                    F("quantity_used") * F("unit_cost"),
                    output_field=DecimalField()
                )
            )
        )
        total_expense = expense_agg["expense"] or 0

        total_profit = total_revenue - total_expense

        return Response({
            "total_revenue": total_revenue,
            "total_expense": total_expense,
            "total_profit": total_profit,
        })

    @action(detail=True, methods=["post"], url_path="add-part")
    def add_part(self, request, pk=None):
        """Use a spare part on this repair — deducts from inventory."""
        ticket = self.get_object()

        if ticket.status == RepairTicket.Status.COLLECTED:
            return Response(
                {"error": "Cannot add parts to a collected repair."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        serializer = AddPartSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        shop = request.user.shop

        with transaction.atomic():
            try:
                product = Product.objects.select_for_update().get(
                    id=serializer.validated_data["product_id"],
                    shop=shop,
                    is_active=True,
                )
            except Product.DoesNotExist:
                return Response(
                    {"error": "Product not found."},
                    status=status.HTTP_404_NOT_FOUND,
                )

            qty = serializer.validated_data["quantity"]
            if product.quantity < qty:
                return Response(
                    {"error": f"Only {product.quantity} of '{product.name}' in stock."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            # Deduct from inventory
            product.quantity -= qty
            product.save()

            StockLog.objects.create(
                product=product,
                change_amount=-qty,
                quantity_after=product.quantity,
                reason=StockLog.Reason.REPAIR,
                note=f"Used in Repair #{ticket.id}",
                created_by=request.user,
            )

            part = RepairPart.objects.create(
                ticket=ticket,
                product=product,
                product_name=product.name,
                quantity_used=qty,
                unit_cost=product.cost_price,
            )

        return Response({
            "message": f"'{product.name}' added to repair.",
            "part": {
                "product_name": part.product_name,
                "quantity_used": part.quantity_used,
                "unit_cost": str(part.unit_cost),
            },
            "ticket": self.serialize_ticket(ticket),
        })

    @action(detail=True, methods=["post"], url_path="record-payment")
    def record_payment(self, request, pk=None):
        """
        Record a payment (deposit, full payment, or correction) without changing status.
        """
        ticket = self.get_object()
        serializer = CollectPaymentSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        ticket.amount_paid = serializer.validated_data["amount_paid"]
        ticket.final_cost = serializer.validated_data.get("final_cost", ticket.estimated_cost)
        ticket.save()

        return Response({
            "message": "Payment records updated.",
            "ticket": self.serialize_ticket(ticket),
        })
