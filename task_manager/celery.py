import os
import django
from celery import Celery
from celery.schedules import crontab

# Set the default Django settings module for the 'celery' program.
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'task_manager.settings')

django.setup()

app = Celery('task_manager')

# Using a string here means the worker doesn't have to serialize
# the configuration object to child processes.
app.config_from_object('django.conf:settings', namespace='CELERY')

# Load task modules from all registered Django apps.
app.autodiscover_tasks()

# Configure periodic tasks
app.conf.beat_schedule = {
    # Example periodic task - uncomment and modify as needed
    # 'cleanup-old-tasks': {
    #     'task': 'task_manager.tasks.cleanup_old_tasks',
    #     'schedule': crontab(hour=2, minute=0),  # Run at 2 AM daily
    # },
    # 'send-daily-report': {
    #     'task': 'task_manager.tasks.send_daily_report',
    #     'schedule': crontab(hour=9, minute=0),  # Run at 9 AM daily
    # },
}


@app.task(bind=True, ignore_result=True)
def debug_task(self):
    """Debug task to test Celery setup."""
    print(f'Request: {self.request!r}')
    return 'Debug task completed successfully'
