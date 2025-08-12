"""
TaskIQ tasks for the tasks app.

This module contains all TaskIQ background tasks for the task management system,
including notification sending, task status updates, and comment notifications.
"""

import os
from pathlib import Path

from taskiq import task as taskiq_task
from django.conf import settings
from django.urls import reverse

from task_manager.tasks.models import Comment
from task_manager.users.bot import bot_admin


@taskiq_task  # type: ignore
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
        chat_id=os.environ.get('CHAT_ID'),
        text=(f'Создана новая задача: {task_name}\nПосмотреть подробнее: {task_url}'),
    )


@taskiq_task  # type: ignore
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
        chat_id=os.environ.get('CHAT_ID'),
        text=(f'Задача "{task_name}" была изменена!\nПосмотреть подробнее: {task_url}'),
    )


@taskiq_task  # type: ignore
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
        chat_id=os.environ.get('CHAT_ID'),
        text=f'Задача "{task_name}" была удалена!',
    )


@taskiq_task  # type: ignore
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
        chat_id=os.environ.get('CHAT_ID'),
        text=f'Напоминание об открытой задаче "{task_name}"!\nОсталось {task_time}\n{task_url}',
    )


@taskiq_task  # type: ignore
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
        with open(file_path, 'rb') as file:
            bot_admin.send_photo(
                chat_id=os.environ.get('CHAT_ID'),
                photo=file,
                caption=f'Напоминание об открытой задаче "{task_name}"!\nОсталось {task_time}\n{task_url}',
            )
    except FileNotFoundError:
        bot_admin.send_message(
            chat_id=os.environ.get('CHAT_ID'),
            text=f'Напоминание об открытой задаче "{task_name}"!\nОсталось {task_time}\n{task_url}',
        )


@taskiq_task  # type: ignore
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
        chat_id=os.environ.get('CHAT_ID'),
        text=f'Задача "{task_name}" была закрыта!\n{task_url}',
    )


@taskiq_task  # type: ignore
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
        chat_id=os.environ.get('CHAT_ID'),
        text=f'Задача "{task_name}" была переоткрыта!\n{task_url}',
    )


@taskiq_task  # type: ignore
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
        chat_id=os.environ.get('CHAT_ID'),
        text=f'{moved_by} переместил задачу "{task_name}" в {stage_name}.\n{task_url}',
    )


@taskiq_task  # type: ignore
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

        task_url = reverse('tasks:view_task', args=[task.slug])
        full_url = (
            f'{settings.SITE_URL}{task_url}'
            if hasattr(settings, 'SITE_URL')
            else task_url
        )
        message = (
            f'Новый комментарий к задаче "{task.name}"\n'
            f'Автор: {author}\n'
            f'Комментарий: {comment.content[:100]}{"..." if len(comment.content) > 100 else ""}\n'
            f'Посмотреть задачу: {full_url}'
        )

        bot_admin.send_message(
            chat_id=str(os.environ.get('CHAT_ID')),
            text=message,
        )
    except Comment.DoesNotExist:
        pass
