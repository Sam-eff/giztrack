from rest_framework import viewsets, permissions
from rest_framework.exceptions import PermissionDenied
from apps.accounts.models import Role
from utils.permissions import IsAdminOrStaff, IsSameShop, IsProPlan
from .models import Expense
from .serializers import ExpenseSerializer

class ExpenseViewSet(viewsets.ModelViewSet):
    serializer_class = ExpenseSerializer
    permission_classes = [permissions.IsAuthenticated, IsAdminOrStaff, IsSameShop, IsProPlan]

    def get_queryset(self):
        user = self.request.user
        qs = Expense.objects.filter(shop=user.shop)
        
        # Optional date filtering
        start_date = self.request.query_params.get("start_date")
        end_date = self.request.query_params.get("end_date")
        if start_date:
            qs = qs.filter(date__gte=start_date)
        if end_date:
            qs = qs.filter(date__lte=end_date)
            
        return qs

    def _enforce_staff_expense_logging_allowed(self):
        user = self.request.user
        shop = getattr(user, "shop", None)

        if user.role == Role.STAFF and shop and not shop.allow_staff_expense_logging:
            raise PermissionDenied(
                "Staff members are not allowed to log expenses. "
                "Ask an admin to enable staff expense logging."
            )

    def perform_create(self, serializer):
        self._enforce_staff_expense_logging_allowed()
        serializer.save(
            shop=self.request.user.shop,
            logged_by=self.request.user
        )

    def perform_update(self, serializer):
        self._enforce_staff_expense_logging_allowed()
        serializer.save()

    def perform_destroy(self, instance):
        self._enforce_staff_expense_logging_allowed()
        instance.delete()
