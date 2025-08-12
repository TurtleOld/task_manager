"""
Django management command to test Celery functionality.

This command provides various options to test different aspects of Celery
including task execution, result retrieval, and monitoring.
"""

from django.core.management.base import BaseCommand, CommandError
from django.conf import settings
from task_manager.tasks.example_tasks import (
    example_task,
    example_task_with_retry,
    send_welcome_email,
    long_running_task,
    rate_limited_task,
    time_limited_task,
)
from task_manager.celery import debug_task
import time


class Command(BaseCommand):
    help = 'Test Celery functionality with various example tasks'

    def add_arguments(self, parser):
        parser.add_argument(
            '--task',
            type=str,
            choices=[
                'debug',
                'simple',
                'retry',
                'email',
                'long-running',
                'rate-limited',
                'time-limited',
                'all'
            ],
            default='debug',
            help='Type of task to test'
        )
        parser.add_argument(
            '--email',
            type=str,
            help='Email address for email task test'
        )
        parser.add_argument(
            '--name',
            type=str,
            default='Test User',
            help='Name for email task test'
        )

    def handle(self, *args, **options):
        task_type = options['task']
        
        self.stdout.write(
            self.style.SUCCESS(f'Testing Celery task: {task_type}')
        )
        
        if task_type == 'debug':
            self.test_debug_task()
        elif task_type == 'simple':
            self.test_simple_task()
        elif task_type == 'retry':
            self.test_retry_task()
        elif task_type == 'email':
            self.test_email_task(options['email'], options['name'])
        elif task_type == 'long-running':
            self.test_long_running_task()
        elif task_type == 'rate-limited':
            self.test_rate_limited_task()
        elif task_type == 'time-limited':
            self.test_time_limited_task()
        elif task_type == 'all':
            self.test_all_tasks(options['email'], options['name'])

    def test_debug_task(self):
        """Test the debug task."""
        self.stdout.write('Testing debug task...')
        
        result = debug_task.delay()
        
        self.stdout.write(f'Task ID: {result.id}')
        self.stdout.write(f'Task Status: {result.status}')
        
        # Wait for result
        try:
            task_result = result.get(timeout=10)
            self.stdout.write(
                self.style.SUCCESS(f'Task completed: {task_result}')
            )
        except Exception as e:
            self.stdout.write(
                self.style.ERROR(f'Task failed: {e}')
            )

    def test_simple_task(self):
        """Test the simple example task."""
        self.stdout.write('Testing simple task...')
        
        result = example_task.delay(10, 20)
        
        self.stdout.write(f'Task ID: {result.id}')
        self.stdout.write(f'Task Status: {result.status}')
        
        # Wait for result
        try:
            task_result = result.get(timeout=10)
            self.stdout.write(
                self.style.SUCCESS(f'Task completed: {task_result}')
            )
        except Exception as e:
            self.stdout.write(
                self.style.ERROR(f'Task failed: {e}')
            )

    def test_retry_task(self):
        """Test the retry task."""
        self.stdout.write('Testing retry task...')
        
        # Test successful execution
        result1 = example_task_with_retry.delay('success')
        self.stdout.write(f'Success task ID: {result1.id}')
        
        # Test task that will fail and retry
        result2 = example_task_with_retry.delay('fail')
        self.stdout.write(f'Fail task ID: {result2.id}')
        
        # Wait for success result
        try:
            task_result = result1.get(timeout=10)
            self.stdout.write(
                self.style.SUCCESS(f'Success task completed: {task_result}')
            )
        except Exception as e:
            self.stdout.write(
                self.style.ERROR(f'Success task failed: {e}')
            )

    def test_email_task(self, email, name):
        """Test the email task."""
        if not email:
            self.stdout.write(
                self.style.WARNING('Email not provided, skipping email task test')
            )
            return
            
        self.stdout.write(f'Testing email task for {email}...')
        
        result = send_welcome_email.delay(email, name)
        
        self.stdout.write(f'Task ID: {result.id}')
        self.stdout.write(f'Task Status: {result.status}')
        
        # Wait for result
        try:
            task_result = result.get(timeout=10)
            self.stdout.write(
                self.style.SUCCESS(f'Email task completed: {task_result}')
            )
        except Exception as e:
            self.stdout.write(
                self.style.ERROR(f'Email task failed: {e}')
            )

    def test_long_running_task(self):
        """Test the long running task."""
        self.stdout.write('Testing long running task...')
        
        result = long_running_task.delay('test-task-123')
        
        self.stdout.write(f'Task ID: {result.id}')
        self.stdout.write(f'Task Status: {result.status}')
        
        # Monitor progress
        for i in range(12):  # Wait up to 12 seconds
            try:
                task_info = result.info
                if task_info and 'progress' in task_info:
                    self.stdout.write(
                        f'Progress: {task_info["progress"]:.1f}% - {task_info["status"]}'
                    )
                time.sleep(1)
            except Exception:
                pass
        
        # Get final result
        try:
            task_result = result.get(timeout=5)
            self.stdout.write(
                self.style.SUCCESS(f'Long running task completed: {task_result}')
            )
        except Exception as e:
            self.stdout.write(
                self.style.ERROR(f'Long running task failed: {e}')
            )

    def test_rate_limited_task(self):
        """Test the rate limited task."""
        self.stdout.write('Testing rate limited task...')
        
        results = []
        for i in range(5):
            result = rate_limited_task.delay(f'data-{i}')
            results.append(result)
            self.stdout.write(f'Task {i+1} ID: {result.id}')
        
        # Wait for all results
        for i, result in enumerate(results):
            try:
                task_result = result.get(timeout=10)
                self.stdout.write(
                    self.style.SUCCESS(f'Rate limited task {i+1} completed: {task_result}')
                )
            except Exception as e:
                self.stdout.write(
                    self.style.ERROR(f'Rate limited task {i+1} failed: {e}')
                )

    def test_time_limited_task(self):
        """Test the time limited task."""
        self.stdout.write('Testing time limited task...')
        
        result = time_limited_task.delay('test-data')
        
        self.stdout.write(f'Task ID: {result.id}')
        self.stdout.write(f'Task Status: {result.status}')
        
        # Wait for result
        try:
            task_result = result.get(timeout=35)  # Longer timeout than task limit
            self.stdout.write(
                self.style.SUCCESS(f'Time limited task completed: {task_result}')
            )
        except Exception as e:
            self.stdout.write(
                self.style.ERROR(f'Time limited task failed: {e}')
            )

    def test_all_tasks(self, email, name):
        """Test all task types."""
        self.stdout.write('Testing all task types...')
        
        self.test_debug_task()
        self.stdout.write('')
        
        self.test_simple_task()
        self.stdout.write('')
        
        self.test_retry_task()
        self.stdout.write('')
        
        if email:
            self.test_email_task(email, name)
            self.stdout.write('')
        
        self.test_long_running_task()
        self.stdout.write('')
        
        self.test_rate_limited_task()
        self.stdout.write('')
        
        self.test_time_limited_task()
        
        self.stdout.write(
            self.style.SUCCESS('All task tests completed!')
        )
