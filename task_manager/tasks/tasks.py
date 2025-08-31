"""
Celery tasks for the tasks app.

This module contains all Celery background tasks for the task management system,
including notification sending, task status updates, and comment notifications.
"""

import os
from datetime import timedelta
from pathlib import Path

from celery import shared_task
from django.conf import settings
from django.urls import reverse
from django.utils.timezone import now

from task_manager.tasks.models import Comment, Task
from task_manager.users.bot import bot_admin
from task_manager.users.models import User

# Constants
CHAT_ID_ENV_VAR = 'CHAT_ID'
CHAT_ID: str = os.environ.get(CHAT_ID_ENV_VAR) or ''
MAX_COMMENT_PREVIEW_LENGTH = 100


@shared_task
def send_message_about_adding_task(task_name, task_url) -> None:
    """
    Send a notification about a new task being created.

    Sends a Telegram message to notify users about a newly created task.

    Args:
        task_name: The name of the created task
        task_url: The URL to view the task details

    Returns:
        None
    """
    bot_admin.send_message(
        chat_id=CHAT_ID,
        text=(
            f'Создана новая задача: {task_name}\nПосмотреть подробнее: {task_url}'
        ),
    )


@shared_task
def send_about_updating_task(task_name, task_url) -> None:
    """
    Send a notification about a task being updated.

    Sends a Telegram message to notify users about a task being modified.

    Args:
        task_name: The name of the updated task
        task_url: The URL to view the task details

    Returns:
        None
    """
    bot_admin.send_message(
        chat_id=CHAT_ID,
        text=(
            f'Задача "{task_name}" была изменена!\nПосмотреть подробнее: {task_url}'
        ),
    )


@shared_task
def send_about_deleting_task(task_name) -> None:
    """
    Send a notification about a task being deleted.

    Sends a Telegram message to notify users about a task being removed.

    Args:
        task_name: The name of the deleted task

    Returns:
        None
    """
    bot_admin.send_message(
        chat_id=CHAT_ID,
        text=f'Задача "{task_name}" была удалена!',
    )


@shared_task
def send_notification_about_task(
    task_name,
    task_time,
    task_url,
) -> None:
    """
    Send a reminder notification about an upcoming task deadline.

    Sends a Telegram message to remind users about a task deadline.

    Args:
        task_name: The name of the task
        task_time: The time remaining until the deadline
        task_url: The URL to view the task details

    Returns:
        None
    """
    bot_admin.send_message(
        chat_id=CHAT_ID,
        text=f'Напоминание об открытой задаче "{task_name}"!\nОсталось {task_time}\n{task_url}',
    )


@shared_task
def send_notification_with_photo_about_task(
    task_name,
    task_time,
    task_url,
    task_file_path,
) -> None:
    """
    Send a reminder notification with task image about an upcoming deadline.

    Sends a Telegram message with an image attachment to remind users
    about a task deadline. Falls back to text-only if image is not found.

    Args:
        task_name: The name of the task
        task_time: The time remaining until the deadline
        task_url: The URL to view the task details
        task_file_path: The path to the task's image file

    Returns:
        None
    """
    file_path = Path(settings.BASE_DIR).joinpath(task_file_path)
    try:
        with Path.open(file_path, 'rb') as task_file:
            bot_admin.send_photo(
                chat_id=CHAT_ID,
                photo=task_file,
                caption=f'Напоминание об открытой задаче "{task_name}"!\nОсталось {task_time}\n{task_url}',
            )
    except FileNotFoundError:
        bot_admin.send_message(
            chat_id=CHAT_ID,
            text=f'Напоминание об открытой задаче "{task_name}"!\nОсталось {task_time}\n{task_url}',
        )


@shared_task
def send_about_closing_task(task_name, task_url) -> None:
    """
    Send a notification about a task being closed.

    Sends a Telegram message to notify users about a task being completed.

    Args:
        task_name: The name of the closed task
        task_url: The URL to view the task details

    Returns:
        None
    """
    bot_admin.send_message(
        chat_id=CHAT_ID,
        text=f'Задача "{task_name}" была закрыта!\n{task_url}',
    )


@shared_task
def send_about_opening_task(task_name, task_url) -> None:
    """
    Send a notification about a task being reopened.

    Sends a Telegram message to notify users about a task being reopened.

    Args:
        task_name: The name of the reopened task
        task_url: The URL to view the task details

    Returns:
        None
    """
    bot_admin.send_message(
        chat_id=CHAT_ID,
        text=f'Задача "{task_name}" была переоткрыта!\n{task_url}',
    )


@shared_task
def send_about_moving_task(task_name, moved_by, stage_name, task_url) -> None:
    """
    Send a notification about a task being moved to a different stage.

    Sends a Telegram message to notify users about a task being moved
    between workflow stages.

    Args:
        task_name: The name of the moved task
        moved_by: The name of the user who moved the task
        stage_name: The name of the destination stage
        task_url: The URL to view the task details

    Returns:
        None
    """
    bot_admin.send_message(
        chat_id=CHAT_ID,
        text=f'{moved_by} переместил задачу "{task_name}" в {stage_name}.\n{task_url}',
    )


def _get_task_url(task: 'Task') -> str:
    """Get full task URL."""
    task_url = reverse('tasks:view_task', args=[task.slug])
    site_url = getattr(settings, 'SITE_URL', 'http://127.0.0.1:8000')
    return f'{site_url}{task_url}'


def _get_comment_preview(comment_content: str) -> str:
    """Get comment preview with ellipsis if needed."""
    preview = comment_content[:MAX_COMMENT_PREVIEW_LENGTH]
    ellipsis = (
        '...' if len(comment_content) > MAX_COMMENT_PREVIEW_LENGTH else ''
    )
    return f'{preview}{ellipsis}'


def _build_comment_message(
    task: 'Task', author: 'User', comment_preview: str, full_url: str
) -> str:
    """Build notification message for comment."""
    return (
        f'Новый комментарий к задаче "{task.name}"\n'
        f'Автор: {author}\n'
        f'Комментарий: {comment_preview}\n'
        f'Посмотреть задачу: {full_url}'
    )


@shared_task
def send_comment_notification(comment_id: int) -> None:
    """
    Send a notification about a new comment on a task.

    Sends a Telegram message to notify task executors about new comments.
    Includes comment author, content preview, and task details.

    Args:
        comment_id: The ID of the comment that was created

    Returns:
        None
    """
    try:
        comment = Comment.objects.get(id=comment_id)
        task = comment.task
        author = comment.author

        full_url = _get_task_url(task)
        comment_preview = _get_comment_preview(comment.comment_content)
        message = _build_comment_message(
            task, author, comment_preview, full_url
        )

        bot_admin.send_message(
            chat_id=CHAT_ID,
            text=message,
        )
    except Comment.DoesNotExist:
        # Comment was deleted, no need to send notification
        return


@shared_task
def check_task_deadlines():
    """
    Periodic task to check for upcoming task deadlines and send notifications.

    This task runs every 5 minutes and checks all active tasks with deadlines
    to see if any notifications need to be sent based on reminder periods.
    """
    import logging

    logger = logging.getLogger(__name__)

    current_time = now()
    logger.info(f'Checking task deadlines at {current_time}')

    # Get all tasks with deadlines that are not completed
    tasks_with_deadlines = Task.objects.filter(
        deadline__isnull=False,
        state=False,  # Not completed
        reminder_periods__isnull=False,
    ).exclude(reminder_periods='')

    logger.info(
        f'Found {tasks_with_deadlines.count()} tasks with deadlines and reminders'
    )

    from task_manager.tasks.models import PERIOD_DICT

    for task in tasks_with_deadlines:
        if not task.deadline or not task.reminder_periods:
            continue

        logger.info(f'Processing task: {task.name} (deadline: {task.deadline})')

        # Get reminder periods from the task
        period_values = task.get_reminder_periods_list()
        logger.info(f'  Reminder periods: {period_values}')

        # Check each reminder period for this task
        for period_str in period_values:
            try:
                period_minutes = int(period_str)
                notification_time = task.deadline - timedelta(
                    minutes=period_minutes
                )

                # Check if we should send notification now (within 5 minute window)
                time_diff = abs(
                    (current_time - notification_time).total_seconds()
                )

                logger.info(
                    f'    Period {period_minutes}min: notification_time={notification_time}, time_diff={time_diff:.1f}s'
                )

                if time_diff <= 300:  # Within 5 minutes
                    # Check if notification already sent for this period
                    if task.is_notification_sent(period_minutes):
                        logger.info(
                            f'    Notification already sent for task {task.name}, period {period_minutes}min'
                        )
                        continue

                    logger.info(
                        f'    SENDING notification for task {task.name}, period {period_minutes}min'
                    )

                    # Mark notification as sent before sending
                    task.mark_notification_sent(period_minutes)

                    task_url = _get_task_url(task)
                    period_display = PERIOD_DICT.get(
                        period_minutes, f'{period_minutes} минут'
                    )

                    if task.image:
                        send_notification_with_photo_about_task.delay(
                            task.name,
                            period_display,
                            task_url,
                            task.image.path,
                        )
                    else:
                        send_notification_about_task.delay(
                            task.name,
                            period_display,
                            task_url,
                        )
                else:
                    logger.info(
                        f'    Skipping notification (time_diff={time_diff:.1f}s > 300s)'
                    )
            except ValueError:
                logger.warning(f'    Invalid period value: {period_str}')
                continue
