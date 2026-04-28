from django.db import transaction
from django.db.models.signals import post_save
from django.dispatch import receiver
from .models import Product


@receiver(post_save, sender=Product)
def check_low_stock(sender, instance, **kwargs):
    if instance.quantity <= instance.low_stock_threshold:
        from django_q.tasks import async_task

        transaction.on_commit(
            lambda: async_task(
                "apps.notifications.tasks.notify_low_stock",
                instance.id,
            )
        )
