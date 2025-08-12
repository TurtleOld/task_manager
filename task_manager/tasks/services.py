"""
Service functions for the tasks app.

This module contains utility functions for task management, including
slug generation, notification scheduling, and task-related operations.
"""

from datetime import datetime, timedelta
from typing import Iterable

from transliterate import translit

from django.utils.text import slugify
from django.utils.timezone import now

from task_manager.tasks.models import ReminderPeriod
from task_manager.tasks.tasks import (
    send_notification_about_task,
    send_notification_with_photo_about_task,
)


def slugify_translit(task_name: str) -> str:
    """
    Generate a URL-friendly slug from a Russian task name.
    
    Transliterates Russian text to Latin characters and then creates
    a URL-friendly slug by converting to lowercase and replacing
    spaces with hyphens.
    
    Args:
        task_name: The task name in Russian to convert to a slug
        
    Returns:
        A URL-friendly slug string
    """
    translite_name = translit(task_name, language_code='ru', reversed=True)
    return slugify(translite_name)


def notify(
    task_name: str,
    reminder_periods: Iterable[ReminderPeriod],
    deadline: datetime,
    task_file_path: str | None,
    task_url: str,
) -> None:
    """
    Schedule notifications for task reminders.

    Creates scheduled notifications for each reminder period before the task deadline.
    Notifications can include task images if available, and are scheduled using
    TaskIQ's kiq with specific execution times.

    Args:
        task_name: The name of the task to send notifications about
        reminder_periods: Collection of reminder periods to schedule notifications for
        deadline: The task deadline datetime
        task_file_path: Optional path to the task's image file
        task_url: The URL to view the task details

    Returns:
        None
    """
    for period in reminder_periods:
        notify_time = deadline - timedelta(minutes=period.period)
        if notify_time > now():
            if task_file_path:
                send_notification_with_photo_about_task.kiq(
                    task_name,
                    f'{period}',
                    task_url,
                    task_file_path,
                ).with_eta(notify_time)
            else:
                send_notification_about_task.kiq(
                    task_name,
                    f'{period}',
                    task_url,
                ).with_eta(notify_time)
