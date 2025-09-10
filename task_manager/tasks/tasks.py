import datetime as dt
import logging
import os
from pathlib import Path

from celery import shared_task
from django.conf import settings
from django.urls import reverse
from django.utils.timezone import now

from task_manager.tasks.models import PERIOD_DICT, Comment, Task
from task_manager.users.bot import bot_admin
from task_manager.users.models import User

CHAT_ID_ENV_VAR = 'CHAT_ID'
CHAT_ID: str = os.environ.get(CHAT_ID_ENV_VAR) or ''
MAX_COMMENT_PREVIEW_LENGTH = 100


@shared_task
def send_message_about_adding_task(task_name, task_url) -> None:
    bot_admin.send_message(
        chat_id=CHAT_ID,
        text=(
            f'Создана новая задача: {task_name}\n'
            f'Посмотреть подробнее: {task_url}'
        ),
    )


@shared_task
def send_about_updating_task(task_name, task_url) -> None:
    bot_admin.send_message(
        chat_id=CHAT_ID,
        text=(
            f'Задача "{task_name}" была изменена!\n'
            f'Посмотреть подробнее: {task_url}'
        ),
    )


@shared_task
def send_about_deleting_task(task_name) -> None:
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
    bot_admin.send_message(
        chat_id=CHAT_ID,
        text=f'Напоминание об открытой задаче "{task_name}"!\n'
        f'Осталось {task_time}\n'
        f'{task_url}',
    )


@shared_task
def send_notification_with_photo_about_task(
    task_name,
    task_time,
    task_url,
    task_file_path,
) -> None:
    file_path = Path(settings.BASE_DIR).joinpath(task_file_path)
    try:
        with Path.open(file_path, 'rb') as task_file:
            bot_admin.send_photo(
                chat_id=CHAT_ID,
                photo=task_file,
                caption=f'Напоминание об открытой задаче "{task_name}"!\n'
                f'Осталось {task_time}\n'
                f'{task_url}',
            )
    except FileNotFoundError:
        bot_admin.send_message(
            chat_id=CHAT_ID,
            text=f'Напоминание об открытой задаче "{task_name}"!\n'
            f'Осталось {task_time}\n'
            f'{task_url}',
        )


@shared_task
def send_about_closing_task(task_name, task_url) -> None:
    bot_admin.send_message(
        chat_id=CHAT_ID,
        text=f'Задача "{task_name}" была закрыта!\n{task_url}',
    )


@shared_task
def send_about_opening_task(task_name, task_url) -> None:
    bot_admin.send_message(
        chat_id=CHAT_ID,
        text=f'Задача "{task_name}" была переоткрыта!\n{task_url}',
    )


@shared_task
def send_about_moving_task(task_name, moved_by, stage_name, task_url) -> None:
    bot_admin.send_message(
        chat_id=CHAT_ID,
        text=f'{moved_by} переместил задачу "{task_name}" в {stage_name}.\n'
        f'{task_url}',
    )


def _get_task_url(task: 'Task') -> str:
    task_url = reverse('tasks:view_task', args=[task.slug])
    site_url = getattr(settings, 'SITE_URL', 'http://127.0.0.1:8000')
    return f'{site_url}{task_url}'


def _get_comment_preview(comment_content: str) -> str:
    preview = comment_content[:MAX_COMMENT_PREVIEW_LENGTH]
    ellipsis = (
        '...' if len(comment_content) > MAX_COMMENT_PREVIEW_LENGTH else ''
    )
    return f'{preview}{ellipsis}'


def _build_comment_message(
    task: 'Task', author: 'User', comment_preview: str, full_url: str
) -> str:
    return (
        f'Новый комментарий к задаче "{task.name}"\n'
        f'Автор: {author}\n'
        f'Комментарий: {comment_preview}\n'
        f'Посмотреть задачу: {full_url}'
    )


@shared_task
def send_comment_notification(comment_id: int) -> None:
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
        return


def _send_task_notification(task: 'Task', period_display: str) -> None:
    task_url = _get_task_url(task)

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


def _process_task_deadline(task: 'Task', current_time) -> None:
    logger = logging.getLogger(__name__)

    if not task.deadline or not task.reminder_periods:
        return

    logger.info('Processing task: %s (deadline: %s)', task.name, task.deadline)

    period_values = task.get_reminder_periods_list()
    logger.info('  Reminder periods: %s', period_values)

    for period_str in period_values:
        try:
            period_minutes = int(period_str)
            notification_time = task.deadline - dt.timedelta(
                minutes=period_minutes
            )

            time_diff = abs((current_time - notification_time).total_seconds())

            logger.info(
                '    Period %smin: notification_time=%s, time_diff=%.1fs',
                period_minutes,
                notification_time,
                time_diff,
            )

            if time_diff <= 300:
                if task.is_notification_sent(period_minutes):
                    logger.info(
                        'Notification already sent for task %s, period %smin',
                        task.name,
                        period_minutes,
                    )
                    continue

                logger.info(
                    '    SENDING notification for task %s, period %smin',
                    task.name,
                    period_minutes,
                )

                task.mark_notification_sent(period_minutes)

                period_display = PERIOD_DICT.get(
                    period_minutes, f'{period_minutes} минут'
                )
                _send_task_notification(task, period_display)
            else:
                logger.info(
                    '    Skipping notification (time_diff=%.1fs > 300s)',
                    time_diff,
                )
        except ValueError:
            logger.warning('    Invalid period value: %s', period_str)
            continue


@shared_task
def check_task_deadlines():
    logger = logging.getLogger(__name__)

    current_time = now()
    logger.info('Checking task deadlines at %s', current_time)

    tasks_with_deadlines = Task.objects.filter(
        deadline__isnull=False,
        state=False,
        reminder_periods__isnull=False,
    ).exclude(reminder_periods='')

    logger.info(
        'Found %d tasks with deadlines and reminders',
        tasks_with_deadlines.count(),
    )

    for task in tasks_with_deadlines:
        _process_task_deadline(task, current_time)
