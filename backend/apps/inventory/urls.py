from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import CategoryViewSet, ProductViewSet, ProductUnitViewSet, StockLogViewSet

router = DefaultRouter()
router.register("categories", CategoryViewSet, basename="category")
router.register("products", ProductViewSet, basename="product")
router.register("units", ProductUnitViewSet, basename="product-unit")
router.register("stock-logs", StockLogViewSet, basename="stock-log")

urlpatterns = [
    path("", include(router.urls)),
]

