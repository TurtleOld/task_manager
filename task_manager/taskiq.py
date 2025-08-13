"""
TaskIQ configuration for the task_manager project.

This module configures TaskIQ for background task processing using RabbitMQ as broker.
"""

import os
from taskiq_aio_pika import AioPikaBroker
from taskiq import InMemoryBroker

# Configure the broker based on environment
if os.getenv('TASKIQ_SYNC_MODE', 'false').lower() in ('true', '1', 'yes'):
    # Use in-memory broker for synchronous mode (development/testing)
    broker = InMemoryBroker()
else:
    # Use RabbitMQ broker for production
    broker = AioPikaBroker(
        url=os.environ.get('BROKER_URL', 'amqp://rabbitmq:rabbitmq@rabbitmq:5672/'),
    )

# Tasks will be imported when Django is ready
