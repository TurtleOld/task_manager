"""
Management command to create default Stage objects in database.

This command creates default workflow stages (To Do, In Progress, Done)
so they can be used for task management.
"""

from django.core.management.base import BaseCommand

from task_manager.tasks.models import Stage


class Command(BaseCommand):
    """Create default Stage objects."""

    help = 'Create default Stage objects for task workflow'

    def handle(self, *args, **options):
        """Handle the command execution."""
        self.stdout.write('Creating default Stage objects...')

        default_stages = [
            ('To Do', 1),
            ('In Progress', 2),
            ('Done', 3),
        ]

        created_count = 0
        existing_count = 0

        for name, order in default_stages:
            stage, created = Stage.objects.get_or_create(
                name=name,
                defaults={
                    'order': order,
                },
            )

            if created:
                created_count += 1
                self.stdout.write(f'Created stage: {name}')
            else:
                existing_count += 1

        self.stdout.write(
            self.style.SUCCESS(
                f'Command completed! Created: {created_count}, '
                f'Already existed: {existing_count}'
            )
        )

        # Show all available stages
        self.stdout.write('\nAll available stages:')
        for stage in Stage.objects.all().order_by('order'):
            self.stdout.write(f'  {stage.name} (order: {stage.order})')
