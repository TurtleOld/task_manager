"""
Management command to setup complete task system.

This command sets up everything needed for the task system:
- ReminderPeriod objects for all PERIOD values
- Default Stage objects for workflow
- Periodic tasks for deadline notifications
"""

from django.core.management.base import BaseCommand
from django.core.management import call_command


class Command(BaseCommand):
    """Setup complete task system with all required objects."""

    help = 'Setup complete task system with reminder periods, stages, and periodic tasks'

    def handle(self, *args, **options):
        """Handle the command execution."""
        self.stdout.write(
            self.style.SUCCESS('Setting up complete task system...')
        )

        # Create default stages
        self.stdout.write('\n1. Creating default stages...')
        call_command('create_default_stages')

        # Setup periodic tasks
        self.stdout.write('\n2. Setting up periodic tasks...')
        call_command('setup_periodic_tasks')

        self.stdout.write(
            self.style.SUCCESS(
                '\n✅ Task system setup completed successfully!'
                '\nYou can now:'
                '\n  - Create tasks with reminder periods (from PERIOD constant)'
                '\n  - Move tasks between workflow stages'
                '\n  - Receive deadline notifications via Telegram'
            )
        )
