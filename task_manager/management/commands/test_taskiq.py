"""
Django management command to test TaskIQ functionality.

This command provides various options to test different aspects of TaskIQ
including task execution, scheduling, and error handling.
"""

import os
from django.core.management.base import BaseCommand, CommandError
from django.conf import settings

from task_manager.taskiq import broker
from task_manager.tasks.example_tasks import (
    example_task,
    example_task_with_retry,
    send_welcome_email,
    long_running_task,
    cleanup_old_tasks,
    send_daily_report,
    rate_limited_task,
    time_limited_task,
)


class Command(BaseCommand):
    """Django management command for testing TaskIQ functionality."""

    help = 'Test TaskIQ functionality with various example tasks'

    def add_arguments(self, parser):
        """Add command line arguments."""
        parser.add_argument(
            'task_type',
            nargs='?',
            default='basic',
            choices=[
                'basic',
                'retry',
                'email',
                'long-running',
                'cleanup',
                'report',
                'rate-limited',
                'time-limited',
                'all',
            ],
            help='Type of task to test (default: basic)',
        )
        
        parser.add_argument(
            '--email',
            type=str,
            default='test@example.com',
            help='Email address for email tests',
        )
        
        parser.add_argument(
            '--name',
            type=str,
            default='Test User',
            help='Name for email tests',
        )

    def handle(self, *args, **options):
        """Handle the command execution."""
        task_type = options['task_type']
        
        self.stdout.write(
            self.style.SUCCESS(f'Testing TaskIQ task: {task_type}')
        )
        
        try:
            if task_type == 'basic' or task_type == 'all':
                self.test_basic_task()
            
            if task_type == 'retry' or task_type == 'all':
                self.test_retry_task()
            
            if task_type == 'email' or task_type == 'all':
                self.test_email_task(options['email'], options['name'])
            
            if task_type == 'long-running' or task_type == 'all':
                self.test_long_running_task()
            
            if task_type == 'cleanup' or task_type == 'all':
                self.test_cleanup_task()
            
            if task_type == 'report' or task_type == 'all':
                self.test_report_task()
            
            if task_type == 'rate-limited' or task_type == 'all':
                self.test_rate_limited_task()
            
            if task_type == 'time-limited' or task_type == 'all':
                self.test_time_limited_task()
            
            self.stdout.write(
                self.style.SUCCESS('✅ All TaskIQ tests completed successfully!')
            )
            
        except Exception as e:
            raise CommandError(f'TaskIQ test failed: {e}')

    def test_basic_task(self):
        """Test basic task execution."""
        self.stdout.write('  Testing basic task...')
        
        result = example_task.kiq(10, 20)
        self.stdout.write(f'    ✅ Basic task queued: {result}')

    def test_retry_task(self):
        """Test task with retry functionality."""
        self.stdout.write('  Testing retry task...')
        
        # Test successful execution
        result1 = example_task_with_retry.kiq('success')
        self.stdout.write(f'    ✅ Retry task (success) queued: {result1}')
        
        # Test failure case
        result2 = example_task_with_retry.kiq('fail')
        self.stdout.write(f'    ✅ Retry task (fail) queued: {result2}')

    def test_email_task(self, email, name):
        """Test email sending task."""
        self.stdout.write('  Testing email task...')
        
        result = send_welcome_email.kiq(email, name)
        self.stdout.write(f'    ✅ Email task queued: {result}')

    def test_long_running_task(self):
        """Test long-running task."""
        self.stdout.write('  Testing long-running task...')
        
        result = long_running_task.kiq('test-task-123')
        self.stdout.write(f'    ✅ Long-running task queued: {result}')

    def test_cleanup_task(self):
        """Test cleanup task."""
        self.stdout.write('  Testing cleanup task...')
        
        result = cleanup_old_tasks.kiq()
        self.stdout.write(f'    ✅ Cleanup task queued: {result}')

    def test_report_task(self):
        """Test report task."""
        self.stdout.write('  Testing report task...')
        
        result = send_daily_report.kiq()
        self.stdout.write(f'    ✅ Report task queued: {result}')

    def test_rate_limited_task(self):
        """Test rate-limited task."""
        self.stdout.write('  Testing rate-limited task...')
        
        for i in range(5):
            result = rate_limited_task.kiq(f'data-{i}')
            self.stdout.write(f'    ✅ Rate-limited task {i+1} queued: {result}')

    def test_time_limited_task(self):
        """Test time-limited task."""
        self.stdout.write('  Testing time-limited task...')
        
        result = time_limited_task.kiq('test-data')
        self.stdout.write(f'    ✅ Time-limited task queued: {result}')
