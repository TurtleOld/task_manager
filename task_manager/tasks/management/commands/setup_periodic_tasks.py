"""
Management command to setup periodic tasks for deadline notifications.

This command creates periodic tasks in django-celery-beat for sending
notifications about upcoming task deadlines based on PERIOD constant.
"""

from django.core.management.base import BaseCommand
from django_celery_beat.models import IntervalSchedule, PeriodicTask

from task_manager.tasks.models import PERIOD


class Command(BaseCommand):
    """Setup periodic tasks for deadline notifications."""

    help = 'Setup periodic tasks for deadline notifications'

    def handle(self, *args, **options):
        """Handle the command execution."""
        self.stdout.write(
            'Setting up periodic tasks for deadline notifications...'
        )

        schedule, created = IntervalSchedule.objects.get_or_create(
            every=8,
            period=IntervalSchedule.MINUTES,
        )

        if created:
            self.stdout.write(f'Created interval schedule: {schedule}')

        task, created = PeriodicTask.objects.get_or_create(
            name='Check task deadlines',
            defaults={
                'task': 'task_manager.tasks.tasks.check_task_deadlines',
                'interval': schedule,
                'enabled': True,
            },
        )

        if created:
            self.stdout.write(f'Created periodic task: {task.name}')
        else:
            self.stdout.write(f'Periodic task already exists: {task.name}')

        self.stdout.write('\nAvailable reminder periods:')
        for period_value, period_display in PERIOD:
            self.stdout.write(f'  {period_value} minutes - {period_display}')

        self.stdout.write(
            self.style.SUCCESS('Periodic tasks setup completed successfully!')
        )
