import os

from celery import shared_task

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
def send_notification_about_task(task_name):
    bot_admin.send_message(
        chat_id=os.environ.get('CHAT_ID'),
        text=f'Срок выполнения задачи "{task_name}" подходит к концу!',
    )
