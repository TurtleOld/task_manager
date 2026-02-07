from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta

from django.conf import settings
from django.db import transaction
from django.utils import timezone

from .models import (
    Card,
    CardDeadlineReminder,
    NotificationChannel,
    NotificationPreference,
    NotificationProfile,
)


@dataclass(frozen=True)
class ChannelAvailability:
    available: bool
    reason: str


def preferences_enabled_for_event_type(
    *,
    user_id: int,
    board_id: int | None,
    channel: str,
    event_type: str,
) -> bool:
    """Match behavior of [`kanban.tasks._preferences_enabled()`](backend/src/kanban/tasks.py:94).

    Keeps the same checks but without requiring a NotificationEvent.
    """

    qs = NotificationPreference.objects.filter(
        user_id=user_id,
        channel=channel,
        event_type=event_type,
    )
    if board_id:
        board_qs = qs.filter(board_id=board_id)
        if board_qs.exists():
            return bool(board_qs.filter(enabled=True).exists())
    global_qs = qs.filter(board__isnull=True)
    if global_qs.exists():
        return bool(global_qs.filter(enabled=True).exists())
    return True


def reminder_channel_availability(
    *, user_id: int, board_id: int | None, event_type: str
) -> dict[str, ChannelAvailability]:
    profile, _ = NotificationProfile.objects.get_or_create(user_id=user_id)

    def email_availability() -> ChannelAvailability:
        if not preferences_enabled_for_event_type(
            user_id=user_id,
            board_id=board_id,
            channel=NotificationChannel.EMAIL.value,
            event_type=event_type,
        ):
            return ChannelAvailability(False, "Email отключён в настройках уведомлений")
        if not profile.email:
            return ChannelAvailability(False, "Email не указан в профиле уведомлений")
        return ChannelAvailability(True, "")

    def telegram_availability() -> ChannelAvailability:
        if not preferences_enabled_for_event_type(
            user_id=user_id,
            board_id=board_id,
            channel=NotificationChannel.TELEGRAM.value,
            event_type=event_type,
        ):
            return ChannelAvailability(False, "Telegram отключён в настройках уведомлений")
        if not settings.TELEGRAM_BOT_TOKEN:
            return ChannelAvailability(False, "Telegram-бот не настроен на сервере")
        if not profile.telegram_chat_id:
            return ChannelAvailability(False, "Telegram chat_id не указан в профиле уведомлений")
        return ChannelAvailability(True, "")

    return {
        NotificationChannel.EMAIL.value: email_availability(),
        NotificationChannel.TELEGRAM.value: telegram_availability(),
    }


def resolve_delivery_channel(
    *,
    reminder: CardDeadlineReminder,
    availability: dict[str, ChannelAvailability],
) -> str | None:
    if reminder.channel:
        return (
            reminder.channel
            if availability.get(reminder.channel, ChannelAvailability(False, "")).available
            else None
        )

    available = [channel for channel, item in availability.items() if item.available]
    if len(available) == 1:
        return available[0]
    return None


def compute_scheduled_at(*, deadline: datetime, offset_minutes: int) -> datetime:
    return deadline - timedelta(minutes=offset_minutes)


def _as_dt(value: object) -> datetime:
    # Helper for runtime correctness; Card.deadline is expected to be a datetime or None.
    if not isinstance(value, datetime):
        raise TypeError("deadline must be datetime")
    return value


def upsert_and_schedule_reminder(
    *,
    card: Card,
    reminder: CardDeadlineReminder,
) -> CardDeadlineReminder:
    """Validate and (re)schedule the reminder.

    Uses `schedule_token` so previously enqueued tasks become no-ops.
    """

    availability = reminder_channel_availability(
        user_id=reminder.user_id,
        board_id=card.board_id,
        event_type="card.deadline_reminder",
    )

    if not reminder.enabled:
        reminder.status = CardDeadlineReminder.Status.DISABLED
        reminder.scheduled_at = None
        reminder.schedule_token = None
        reminder.last_error = ""
        reminder.sent_at = None
        reminder.save(
            update_fields=[
                "enabled",
                "status",
                "scheduled_at",
                "schedule_token",
                "last_error",
                "sent_at",
                "updated_at",
                "version",
            ]
        )
        return reminder

    if not card.deadline:
        reminder.status = CardDeadlineReminder.Status.INVALID_NO_DEADLINE
        reminder.scheduled_at = None
        reminder.schedule_token = None
        reminder.last_error = ""
        reminder.sent_at = None
        reminder.save(
            update_fields=[
                "enabled",
                "status",
                "scheduled_at",
                "schedule_token",
                "last_error",
                "sent_at",
                "updated_at",
                "version",
            ]
        )
        return reminder

    channel = resolve_delivery_channel(reminder=reminder, availability=availability)
    if not channel:
        reminder.status = CardDeadlineReminder.Status.INVALID_CHANNEL
        reminder.scheduled_at = None
        reminder.schedule_token = None
        reminder.last_error = ""
        reminder.sent_at = None
        reminder.save(
            update_fields=[
                "enabled",
                "status",
                "scheduled_at",
                "schedule_token",
                "last_error",
                "sent_at",
                "updated_at",
                "version",
            ]
        )
        return reminder

    scheduled_at = compute_scheduled_at(
        deadline=_as_dt(card.deadline), offset_minutes=reminder.offset_minutes()
    )
    reminder.scheduled_at = scheduled_at

    now = timezone.now()
    if scheduled_at <= now:
        reminder.status = CardDeadlineReminder.Status.INVALID_PAST
        reminder.schedule_token = None
        reminder.last_error = ""
        reminder.sent_at = None
        reminder.save(
            update_fields=[
                "enabled",
                "status",
                "scheduled_at",
                "schedule_token",
                "last_error",
                "sent_at",
                "updated_at",
                "version",
            ]
        )
        return reminder

    token = uuid.uuid4()
    reminder.status = CardDeadlineReminder.Status.SCHEDULED
    reminder.schedule_token = token
    reminder.last_error = ""
    reminder.sent_at = None
    reminder.save(
        update_fields=[
            "enabled",
            "status",
            "scheduled_at",
            "schedule_token",
            "last_error",
            "sent_at",
            "updated_at",
            "version",
        ]
    )

    # Enqueue after commit so the task doesn't fire before DB state is visible.
    # Local import to avoid circular imports.
    from .tasks import send_card_deadline_reminder

    task = send_card_deadline_reminder
    transaction.on_commit(
        lambda: task.apply_async(args=[reminder.id, str(token)], eta=scheduled_at)
    )
    return reminder
