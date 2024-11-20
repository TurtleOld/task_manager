from datetime import datetime, timedelta
from typing import Any
from transliterate import translit
from django.utils.text import slugify
from django.utils.timezone import now

from task_manager.tasks.tasks import (
    send_notification_about_task,
    send_notification_with_photo_about_task,
)


def slugify_translit(task_name: str) -> str:
    translite_name = translit(task_name, language_code='ru', reversed=True)
    return slugify(translite_name)


def notify(
    task_name: str,
    reminder_periods: dict[str, Any],
    deadline: datetime,
    task_file_path: str | None,
    task_url: str,
) -> None:
    for period in reminder_periods:
        notify_time = deadline - timedelta(minutes=period.period)  # type: ignore
        if notify_time > now():

            if task_file_path:
                send_notification_with_photo_about_task.apply_async(
                    (
                        task_name,
                        f'{period}',
                        task_url,
                        task_file_path,
                    ),
                    eta=notify_time,
                )
            else:
                send_notification_about_task.apply_async(
                    (
                        task_name,
                        f'{period}',
                        task_url,
                    ),
                    eta=notify_time,
                )
