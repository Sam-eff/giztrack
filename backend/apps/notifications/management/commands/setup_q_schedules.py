"""
Management command to create Django Q2 scheduled tasks.
Replaces the old CELERY_BEAT_SCHEDULE from settings.py.

Usage:
    python manage.py setup_q_schedules
"""
from django.core.management.base import BaseCommand
from django_q.models import Schedule


SCHEDULES = [
    {
        "name": "notify-expiring-subscriptions",
        "func": "apps.notifications.tasks.notify_expiring_subscriptions",
        "schedule_type": Schedule.DAILY,
        "minutes": 0,       # Not used for DAILY, but kept for clarity
        "cron": "0 9 * * *",  # 9:00 AM daily
    },
    {
        "name": "send-daily-summary",
        "func": "apps.notifications.tasks.send_daily_summary",
        "schedule_type": Schedule.DAILY,
        "minutes": 0,
        "cron": "0 8 * * *",  # 8:00 AM daily
    },
    {
        "name": "reconcile-paystack-subscriptions",
        "func": "apps.subscriptions.tasks.reconcile_due_paystack_subscriptions",
        "schedule_type": Schedule.CRON,
        "minutes": 0,
        "cron": "*/30 * * * *",
    },
]


class Command(BaseCommand):
    help = "Create or update Django Q2 scheduled tasks (replaces Celery Beat schedule)"

    def handle(self, *args, **options):
        for sched in SCHEDULES:
            obj, created = Schedule.objects.update_or_create(
                name=sched["name"],
                defaults={
                    "func": sched["func"],
                    "schedule_type": Schedule.CRON,
                    "cron": sched["cron"],
                },
            )
            action = "Created" if created else "Updated"
            self.stdout.write(
                self.style.SUCCESS(f"  {action}: {sched['name']} → {sched['func']}")
            )

        self.stdout.write(self.style.SUCCESS("\nAll schedules are set up."))
