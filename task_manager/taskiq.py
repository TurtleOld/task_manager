"""
TaskIQ configuration for the task_manager project.

This module configures TaskIQ for background task processing using RabbitMQ
as the message broker and defines a scheduler instance for periodic tasks.
"""

import os
from taskiq import TaskiqScheduler
from taskiq_aio_pika import AioPikaBroker

broker = AioPikaBroker(
    url=os.environ.get('BROKER_URL', 'amqp://rabbitmq:rabbitmq@rabbitmq:5672/'),
)

scheduler = TaskiqScheduler(
    broker=broker,
    sources=["task_manager.tasks"],
)
