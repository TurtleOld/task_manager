import os
from pathlib import Path

from celery import shared_task
from django.conf import settings

from task_manager.users.bot import bot_admin


@shared_task
def send_message_about_adding_task(task_name, task_url):
    bot_admin.send_message(
        chat_id=os.environ.get('CHAT_ID'),
        text=(
            f'Создана новая задача: {task_name}\n'
            f'Посмотреть подробнее: {task_url}'
        ),
    )


@shared_task
def send_about_updating_task(task_name, task_url):
    bot_admin.send_message(
        chat_id=os.environ.get('CHAT_ID'),
        text=(
            f'Задача "{task_name}" была изменена!\n'
            f'Посмотреть подробнее: {task_url}'
        ),
    )


@shared_task
def send_about_deleting_task(task_name):
    bot_admin.send_message(
        chat_id=os.environ.get('CHAT_ID'),
        text=f'Задача "{task_name}" была удалена!',
    )


@shared_task
def send_notification_about_task(
    task_name,
    task_time,
    task_url,
):
    bot_admin.send_message(
        chat_id=os.environ.get('CHAT_ID'),
        text=f'Напоминание об открытой задаче "{task_name}"!\nОсталось {task_time}\n{task_url}',
    )


@shared_task
def send_notification_with_photo_about_task(
    task_name,
    task_time,
    task_url,
    task_file_path,
):
    file_path = Path(settings.BASE_DIR).joinpath(task_file_path)
    with open(file_path, 'rb') as file:
        bot_admin.send_photo(
            chat_id=os.environ.get('CHAT_ID'),
            photo=file,
            caption=f'Напоминание об открытой задаче "{task_name}"!\nОсталось {task_time}\n{task_url}',
        )


@shared_task
def send_about_closing_task(task_name, task_url):
    bot_admin.send_message(
        chat_id=os.environ.get('CHAT_ID'),
        text=f'Задача "{task_name}" была закрыта!\n{task_url}',
    )


@shared_task
def send_about_opening_task(task_name, task_url):
    bot_admin.send_message(
        chat_id=os.environ.get('CHAT_ID'),
        text=f'Задача "{task_name}" была переоткрыта!\n{task_url}',
    )
