from django.urls import path
from .views import (
    PlanListView,
    CurrentSubscriptionView,
    InitializePaymentView,
    CancelPendingCheckoutView,
    CancelSubscriptionView,
    PaymentHistoryView,
    SyncSubscriptionView,
    PaystackWebhookView,
    PaystackCallbackView,
)

urlpatterns = [
    path("plans/", PlanListView.as_view(), name="plan-list"),
    path("current/", CurrentSubscriptionView.as_view(), name="current-subscription"),
    path("initialize/", InitializePaymentView.as_view(), name="initialize-payment"),
    path("cancel-checkout/", CancelPendingCheckoutView.as_view(), name="cancel-pending-checkout"),
    path("cancel/", CancelSubscriptionView.as_view(), name="cancel-subscription"),
    path("payments/", PaymentHistoryView.as_view(), name="payment-history"),
    path("sync/", SyncSubscriptionView.as_view(), name="sync-subscription"),
    path("webhook/", PaystackWebhookView.as_view(), name="paystack-webhook"),
    path("callback/", PaystackCallbackView.as_view()),
]
