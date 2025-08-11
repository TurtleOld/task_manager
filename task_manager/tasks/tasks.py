import os
from pathlib import Path

from celery import shared_task
from django.conf import settings
from django.urls import reverse

from task_manager.tasks.models import Comment
from task_manager.users.bot import bot_admin


@shared_task  # type: ignore
def send_message_about_adding_task(task_name, task_url) -> None:
    bot_admin.send_message(
        chat_id=os.environ.get('CHAT_ID'),
        text=(f'Создана новая задача: {task_name}\nПосмотреть подробнее: {task_url}'),
    )


@shared_task  # type: ignore
def send_about_updating_task(task_name, task_url) -> None:
    bot_admin.send_message(
        chat_id=os.environ.get('CHAT_ID'),
        text=(f'Задача "{task_name}" была изменена!\nПосмотреть подробнее: {task_url}'),
    )


@shared_task  # type: ignore
def send_about_deleting_task(task_name) -> None:
    bot_admin.send_message(
        chat_id=os.environ.get('CHAT_ID'),
        text=f'Задача "{task_name}" была удалена!',
    )


@shared_task  # type: ignore
def send_notification_about_task(
    task_name,
    task_time,
    task_url,
) -> None:
    bot_admin.send_message(
        chat_id=os.environ.get('CHAT_ID'),
        text=f'Напоминание об открытой задаче "{task_name}"!\nОсталось {task_time}\n{task_url}',
    )


@shared_task  # type: ignore
def send_notification_with_photo_about_task(
    task_name,
    task_time,
    task_url,
    task_file_path,
) -> None:
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


@shared_task  # type: ignore
def send_about_closing_task(task_name, task_url) -> None:
    bot_admin.send_message(
        chat_id=os.environ.get('CHAT_ID'),
        text=f'Задача "{task_name}" была закрыта!\n{task_url}',
    )


@shared_task  # type: ignore
def send_about_opening_task(task_name, task_url) -> None:
    bot_admin.send_message(
        chat_id=os.environ.get('CHAT_ID'),
        text=f'Задача "{task_name}" была переоткрыта!\n{task_url}',
    )


@shared_task  # type: ignore
def send_about_moving_task(task_name, moved_by, stage_name, task_url) -> None:
    bot_admin.send_message(
        chat_id=os.environ.get('CHAT_ID'),
        text=f'{moved_by} переместил задачу "{task_name}" в {stage_name}.\n{task_url}',
    )


@shared_task  # type: ignore
def send_comment_notification(comment_id: int) -> None:
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
