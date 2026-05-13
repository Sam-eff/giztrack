from django.db import transaction
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from decimal import Decimal

from utils.mixins import ShopScopedMixin
from utils.permissions import IsAdminOrStaff
from apps.accounts.models import Role
from apps.inventory.models import Product, ProductUnit, StockLog
from apps.customers.models import Customer
from .models import Sale, SaleItem, SalePayment
from .serializers import SaleSerializer, CreateSaleSerializer, RecordSalePaymentSerializer


class SaleViewSet(ShopScopedMixin, viewsets.ModelViewSet):
    queryset = Sale.objects.select_related("customer", "staff").prefetch_related(
        "items__product",
        "payments__received_by",
        "units_sold__supplier",
    )
    serializer_class = SaleSerializer
    http_method_names = ["get", "post", "head", "options"]  # sales cannot be edited or deleted

    def get_permissions(self):
        return [IsAuthenticated(), IsAdminOrStaff()]

    def get_queryset(self):
        qs = super().get_queryset()

        # Filter by date range
        date_from = self.request.query_params.get("from")
        date_to = self.request.query_params.get("to")
        staff_id = self.request.query_params.get("staff")

        if date_from:
            qs = qs.filter(created_at__date__gte=date_from)
        if date_to:
            qs = qs.filter(created_at__date__lte=date_to)
        if staff_id:
            qs = qs.filter(staff_id=staff_id)

        return qs

    def _get_serialized_sale(self, sale_id):
        sale = (
            Sale.objects.filter(shop=self.request.user.shop, id=sale_id)
            .select_related("customer", "staff")
            .prefetch_related("items__product", "payments__received_by", "units_sold__supplier")
            .get()
        )
        return self.get_serializer(sale).data

    def _staff_sales_denied_response(self):
        user = self.request.user
        shop = getattr(user, "shop", None)

        if user.role == Role.STAFF and shop and not shop.allow_staff_sales:
            return Response(
                {
                    "error": (
                        "Staff members are not allowed to make sales. "
                        "Ask an admin to enable staff sales access."
                    )
                },
                status=status.HTTP_403_FORBIDDEN,
            )

        return None

    def create(self, request, *args, **kwargs):
        """
        POS sale creation — fully atomic.
        If any product is out of stock, the whole sale is rolled back.
        """
        denied_response = self._staff_sales_denied_response()
        if denied_response:
            return denied_response

        serializer = CreateSaleSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        shop = request.user.shop

        with transaction.atomic():
            # 1. Resolve or create customer
            customer = None
            phone = data.get("customer_phone", "").strip()
            if phone:
                customer, _ = Customer.objects.get_or_create(
                    shop=shop,
                    phone=phone,
                    defaults={"name": data.get("customer_name", phone)},
                )

            # 2. Validate stock and collect product data
            sale_items = []
            total_amount = 0
            total_profit = 0
            try:
                discount = Decimal(str(data.get("discount_amount") or 0))
            except Exception:
                discount = Decimal(0)

            is_pro = shop.has_pro_access
            
            if discount > 0 and not is_pro:
                return Response(
                    {"error": "Applying discounts requires the Pro plan."},
                    status=status.HTTP_403_FORBIDDEN
                )

            for item_data in data["items"]:
                qty = item_data["quantity"]
                
                if item_data.get("product_id"):
                    # Inventory item
                    try:
                        product = Product.objects.select_for_update().get(
                            id=item_data["product_id"],
                            shop=shop,
                            is_active=True,
                        )
                    except Product.DoesNotExist:
                        raise ValueError(f"Product ID {item_data['product_id']} not found.")

                    if product.quantity < qty:
                        raise Exception(f"'{product.name}' only has {product.quantity} in stock, but {qty} was requested.")

                    # Use negotiated price if provided, otherwise use product's selling price
                    custom_price = item_data.get("custom_price")
                    unit_price = Decimal(str(custom_price)) if custom_price is not None else product.selling_price
                    unit_ids = item_data.get("unit_ids", [])
                    if unit_ids and len(unit_ids) != qty:
                        return Response(
                            {"error": f"Select {qty} exact unit(s) for {product.name}."},
                            status=status.HTTP_400_BAD_REQUEST,
                        )

                    subtotal = unit_price * qty
                    profit = (unit_price - product.cost_price) * qty
                    
                    sale_items.append({
                        "product": product,
                        "product_name": product.name,
                        "quantity": qty,
                        "unit_price": unit_price,
                        "unit_cost": product.cost_price,
                        "is_custom": False,
                        "unit_ids": unit_ids,
                    })
                else:
                    if not is_pro:
                        return Response(
                            {"error": "Custom ad-hoc items require the Pro plan."},
                            status=status.HTTP_403_FORBIDDEN
                        )
                    # Custom / ad-hoc item
                    unit_price = item_data.get("unit_price", 0)
                    product_name = item_data.get("product_name", "Custom Item")
                    subtotal = unit_price * qty
                    profit = subtotal  # Custom items are assumed 100% profit (no cost tracking)
                    
                    sale_items.append({
                        "product": None,
                        "product_name": product_name,
                        "quantity": qty,
                        "unit_price": unit_price,
                        "unit_cost": 0,
                        "is_custom": True,
                        "unit_ids": [],
                    })

                total_amount += subtotal
                total_profit += profit

            # Apply discount
            total_amount -= discount
            total_profit -= discount

            # Determine payment
            is_credit = data.get("is_credit", False)
            if is_credit and not phone:
                return Response(
                    {"error": "Credit sales require a customer phone number."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            if is_credit:
                amount_paid = Decimal(str(data.get("amount_paid") or 0))
            else:
                amount_paid = total_amount  # full payment

            if amount_paid > total_amount:
                return Response(
                    {"error": "Amount paid cannot exceed the sale total."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            # 3. Create sale header
            sale = Sale.objects.create(
                shop=shop,
                customer=customer,
                staff=request.user,
                total_amount=total_amount,
                total_profit=total_profit,
                discount_amount=discount,
                amount_paid=amount_paid,
                is_credit=is_credit,
                note=data.get("note", ""),
            )

            if amount_paid > 0:
                SalePayment.objects.create(
                    sale=sale,
                    amount=amount_paid,
                    note="Initial payment at checkout" if is_credit else "Paid in full at checkout",
                    received_by=request.user,
                    created_at=sale.created_at,
                )

            # 4. Create line items + deduct stock
            for item in sale_items:
                SaleItem.objects.create(
                    sale=sale,
                    product=item["product"],
                    product_name=item["product_name"],
                    quantity=item["quantity"],
                    unit_price=item["unit_price"],
                    unit_cost=item["unit_cost"],
                    is_custom=item["is_custom"],
                )
                
                # Only deduct stock for physical products
                if not item["is_custom"] and item["product"]:
                    product = item["product"]
                    product.quantity -= item["quantity"]
                    product.save()

                    StockLog.objects.create(
                        product=product,
                        change_amount=-item["quantity"],
                        quantity_after=product.quantity,
                        reason=StockLog.Reason.SALE,
                        note=f"Sale #{sale.id}",
                        created_by=request.user,
                    )

                    # Update specific IMEI-tracked units if provided
                    from django.utils import timezone
                    unit_ids = item.get("unit_ids", [])
                    if unit_ids:
                        units = ProductUnit.objects.filter(
                            id__in=unit_ids,
                            product=product,
                            status__in=[
                                ProductUnit.Status.IN_STOCK,
                                ProductUnit.Status.RETURNED,
                            ],
                        )
                        if units.count() != len(unit_ids):
                            raise Exception("One or more selected units (IMEIs) are not in stock.")
                        
                        units.update(
                            status=ProductUnit.Status.SOLD,
                            sale=sale,
                            sold_to=customer,
                            sold_at=timezone.now(),
                            selling_price_actual=item["unit_price"]
                        )

        return Response(
            {
                "message": "Sale recorded successfully.",
                "sale": self._get_serialized_sale(sale.id),
            },
            status=status.HTTP_201_CREATED,
        )

    # Override destroy to block deletions
    def destroy(self, request, *args, **kwargs):
        return Response(
            {"error": "Sales cannot be deleted."},
            status=status.HTTP_405_METHOD_NOT_ALLOWED,
        )

    @action(detail=True, methods=["post"])
    def return_item(self, request, pk=None):
        denied_response = self._staff_sales_denied_response()
        if denied_response:
            return denied_response

        sale = self.get_object()
        item_id = request.data.get("sale_item_id")
        try:
            quantity = int(request.data.get("quantity", 1))
        except ValueError:
            return Response({"error": "Quantity must be an integer."}, status=status.HTTP_400_BAD_REQUEST)
            
        restock = request.data.get("restock", True)

        if not item_id or quantity <= 0:
            return Response({"error": "Invalid payload. Provide a valid 'sale_item_id' and 'quantity' > 0."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            sale_item = sale.items.get(id=item_id)
        except SaleItem.DoesNotExist:
            return Response({"error": "Item not found in this sale."}, status=status.HTTP_404_NOT_FOUND)

        with transaction.atomic():
            # Lock the sale to prevent concurrent updates
            sale = Sale.objects.select_for_update().get(id=sale.id)
            sale_item = SaleItem.objects.select_for_update().get(id=sale_item.id)

            available_to_return = sale_item.quantity - sale_item.returned_quantity
            if quantity > available_to_return:
                return Response(
                    {"error": f"Cannot return {quantity}. Only {available_to_return} left to return/refund."},
                    status=status.HTTP_400_BAD_REQUEST
                )

            # 1. Update SaleItem return counter
            sale_item.returned_quantity += quantity
            sale_item.save(update_fields=["returned_quantity"])

            # 2. Adjust financial totals
            refund_value = sale_item.unit_price * quantity
            refund_profit = (sale_item.unit_price - sale_item.unit_cost) * quantity
            previous_amount_paid = sale.amount_paid

            sale.total_amount -= refund_value
            sale.total_profit -= refund_profit

            # Mathematical protection against negative balances
            if sale.total_amount < 0: sale.total_amount = Decimal(0)
            if sale.total_profit < 0: sale.total_profit = Decimal(0)

            # If the user paid cash and now the total requested amount is less than what they paid, 
            # we consider that we gave them their cash back.
            if sale.amount_paid > sale.total_amount:
                sale.amount_paid = sale.total_amount

            sale.save(update_fields=["total_amount", "total_profit", "amount_paid"])

            payment_adjustment = sale.amount_paid - previous_amount_paid
            if payment_adjustment != 0:
                SalePayment.objects.create(
                    sale=sale,
                    amount=payment_adjustment,
                    note=f"Adjustment after returning {quantity}x {sale_item.product_name}",
                    received_by=request.user,
                )

            # 3. Restock inventory if requested and it's a physical product
            if restock and not sale_item.is_custom and sale_item.product:
                product = Product.objects.select_for_update().get(id=sale_item.product.id)
                product.quantity += quantity
                product.save()

                StockLog.objects.create(
                    product=product,
                    change_amount=quantity,
                    quantity_after=product.quantity,
                    reason=StockLog.Reason.RETURN,
                    note=f"Return from Sale #{sale.id}",
                    created_by=request.user,
                )

                # Mark specific IMEIs as returned if provided
                unit_ids = request.data.get("unit_ids", [])
                if unit_ids:
                    ProductUnit.objects.filter(
                        id__in=unit_ids,
                        product=product,
                        sale=sale
                    ).update(status=ProductUnit.Status.RETURNED)

        return Response({
            "message": f"Successfully returned {quantity}x {sale_item.product_name}.",
            "sale": self._get_serialized_sale(sale.id)
        })

    @action(detail=True, methods=["post"], url_path="record-payment")
    def record_payment(self, request, pk=None):
        denied_response = self._staff_sales_denied_response()
        if denied_response:
            return denied_response

        serializer = RecordSalePaymentSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        amount = serializer.validated_data["amount"]
        note = serializer.validated_data.get("note", "")

        with transaction.atomic():
            sale = Sale.objects.select_for_update().get(
                id=self.get_object().id,
                shop=request.user.shop,
            )

            if sale.balance_owed <= 0:
                return Response(
                    {"error": "This sale has no outstanding balance."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            if amount > sale.balance_owed:
                return Response(
                    {"error": f"Payment cannot exceed the outstanding balance of ₦{sale.balance_owed}."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            sale.amount_paid += amount
            sale.save(update_fields=["amount_paid"])

            SalePayment.objects.create(
                sale=sale,
                amount=amount,
                note=note or "Credit repayment received",
                received_by=request.user,
            )

        return Response(
            {
                "message": "Payment recorded successfully.",
                "sale": self._get_serialized_sale(sale.id),
            }
        )
