from datetime import timedelta
from transliterate import translit
from django.utils.text import slugify
from django.utils.timezone import now

from task_manager.tasks.tasks import (
    send_notification_about_task,
    send_notification_with_photo_about_task,
)


def slugify_translit(task_name):
    translite_name = translit(task_name, language_code='ru', reversed=True)
    return slugify(translite_name)


def notify(task_name, reminder_periods, deadline, task_file_path, task_url):
    for period in reminder_periods:
        notify_time = deadline - timedelta(minutes=period.period)
        if notify_time > now():
            if task_file_path:
                send_notification_with_photo_about_task.apply_async(
                    (
                        task_name,
                        f'{period}',
                        task_url,
                        task_file_path,
                    ),
                    countdown=timedelta(minutes=period.period).total_seconds(),
                )
            else:
                send_notification_about_task.apply_async(
                    (
                        task_name,
                        f'{period}',
                        task_url,
                    ),
                    countdown=timedelta(minutes=period.period).total_seconds(),
                )
