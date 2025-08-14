"""
TaskIQ configuration for the task_manager project.

This module configures TaskIQ for background task processing using RabbitMQ
as the message broker and defines a scheduler instance for periodic tasks.
"""

import os
import django
from taskiq.schedule_sources import LabelScheduleSource
from taskiq import TaskiqScheduler
from taskiq_aio_pika import AioPikaBroker
from dotenv import load_dotenv

load_dotenv()

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'task_manager.settings')
django.setup()

broker = AioPikaBroker(
    url=os.environ.get('BROKER_URL', 'amqp://rabbitmq:rabbitmq@rabbitmq:5672/'),
)

scheduler = TaskiqScheduler(
    broker=broker,
    sources=[LabelScheduleSource(broker)],
)

try:
    from task_manager.tasks.tasks import *

    __all__ = ('broker',)
except ImportError:
    pass
