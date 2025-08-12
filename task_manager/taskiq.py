"""
TaskIQ configuration for the task_manager project.

This module configures TaskIQ for background task processing using RabbitMQ as broker.
"""

import os
from taskiq_aio_pika import AioPikaBroker

# Configure the broker
broker = AioPikaBroker(
    url=os.environ.get('BROKER_URL', 'amqp://rabbitmq:rabbitmq@rabbitmq:5672/'),
)

# Tasks will be imported when Django is ready
