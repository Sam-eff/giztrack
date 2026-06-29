from .reconciliation import reconcile_due_subscriptions


def reconcile_due_paystack_subscriptions():
    """Django Q2 task that repairs missed Paystack renewal webhooks."""
    return reconcile_due_subscriptions()
