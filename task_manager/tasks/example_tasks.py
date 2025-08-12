"""
Example Celery tasks for demonstration purposes.

This module contains example tasks that demonstrate various Celery features
including task routing, error handling, and result storage.
"""

import time
from celery import shared_task
from django.core.mail import send_mail
from django.conf import settings


@shared_task(bind=True)
def example_task(self, x, y):
    """
    Simple example task that adds two numbers.
    
    Args:
        x: First number
        y: Second number
        
    Returns:
        Sum of x and y
    """
    # Simulate some work
    time.sleep(2)
    
    result = x + y
    
    # Update task state
    self.update_state(
        state='PROGRESS',
        meta={'current': 50, 'total': 100, 'status': 'Processing...'}
    )
    
    time.sleep(1)
    
    return result


@shared_task(bind=True, max_retries=3)
def example_task_with_retry(self, data):
    """
    Example task that demonstrates retry functionality.
    
    Args:
        data: Input data
        
    Returns:
        Processed data
    """
    try:
        # Simulate some work that might fail
        if data == 'fail':
            raise Exception("Simulated failure")
        
        # Process the data
        result = f"Processed: {data}"
        return result
        
    except Exception as exc:
        # Retry the task
        raise self.retry(exc=exc, countdown=60)  # Retry after 60 seconds


@shared_task(queue='users')
def send_welcome_email(user_email, user_name):
    """
    Example task for sending welcome email to new users.
    
    This task is routed to the 'users' queue.
    
    Args:
        user_email: User's email address
        user_name: User's name
        
    Returns:
        Success status
    """
    try:
        subject = f'Добро пожаловать, {user_name}!'
        message = f'''
        Здравствуйте, {user_name}!
        
        Добро пожаловать в нашу систему управления задачами!
        
        С уважением,
        Команда Task Manager
        '''
        
        send_mail(
            subject=subject,
            message=message,
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=[user_email],
            fail_silently=False,
        )
        
        return f"Welcome email sent to {user_email}"
        
    except Exception as e:
        return f"Failed to send email to {user_email}: {str(e)}"


@shared_task(bind=True)
def long_running_task(self, task_id):
    """
    Example of a long-running task with progress updates.
    
    Args:
        task_id: Unique identifier for the task
        
    Returns:
        Task completion status
    """
    total_steps = 10
    
    for step in range(total_steps):
        # Simulate work
        time.sleep(1)
        
        # Update progress
        progress = (step + 1) / total_steps * 100
        self.update_state(
            state='PROGRESS',
            meta={
                'current': step + 1,
                'total': total_steps,
                'progress': progress,
                'status': f'Processing step {step + 1}/{total_steps}'
            }
        )
    
    return f"Task {task_id} completed successfully"


@shared_task
def cleanup_old_tasks():
    """
    Example periodic task for cleaning up old data.
    
    This task can be scheduled to run periodically using Celery Beat.
    
    Returns:
        Cleanup status
    """
    # Simulate cleanup work
    time.sleep(5)
    
    # Here you would typically:
    # - Delete old task results
    # - Clean up temporary files
    # - Archive old logs
    # - etc.
    
    return "Cleanup completed successfully"


@shared_task
def send_daily_report():
    """
    Example periodic task for sending daily reports.
    
    This task can be scheduled to run daily using Celery Beat.
    
    Returns:
        Report status
    """
    try:
        # Simulate report generation
        time.sleep(3)
        
        # Here you would typically:
        # - Generate report data
        # - Format the report
        # - Send via email or other channels
        
        return "Daily report sent successfully"
        
    except Exception as e:
        return f"Failed to send daily report: {str(e)}"


@shared_task(bind=True, rate_limit='10/m')
def rate_limited_task(self, data):
    """
    Example task with rate limiting (max 10 per minute).
    
    Args:
        data: Input data
        
    Returns:
        Processed data
    """
    # Simulate processing
    time.sleep(0.5)
    
    return f"Rate limited task processed: {data}"


@shared_task(bind=True, time_limit=30)
def time_limited_task(self, data):
    """
    Example task with time limit (30 seconds).
    
    Args:
        data: Input data
        
    Returns:
        Processed data
    """
    # Simulate work that might take time
    time.sleep(5)
    
    return f"Time limited task processed: {data}"
