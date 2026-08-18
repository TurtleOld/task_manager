from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta

from django.utils import timezone

from .models import (
    Card,
    CardDeadlineReminder,
    NotificationChannel,
    NotificationPreference,
    PushDevice,
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
    """Resolve one channel's preference without requiring a NotificationEvent.

    A board-scoped preference wins over a global one, and no preference at
    all means enabled.
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
    def push_availability() -> ChannelAvailability:
        if not preferences_enabled_for_event_type(
            user_id=user_id,
            board_id=board_id,
            channel=NotificationChannel.PUSH.value,
            event_type=event_type,
        ):
            return ChannelAvailability(False, "Push отключён в настройках уведомлений")
        # Any one active device is enough. With a single channel, "available"
        # means "the person has at least one active device".
        if not PushDevice.objects.filter(user_id=user_id, active=True).exists():
            return ChannelAvailability(False, "Нет подключённых устройств")
        return ChannelAvailability(True, "")

    return {
        NotificationChannel.PUSH.value: push_availability(),
    }


def resolve_delivery_channel(
    *,
    reminder: CardDeadlineReminder,
    availability: dict[str, ChannelAvailability],
) -> str | None:
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
        reason = next(
            (item.reason for item in availability.values() if not item.available),
            "Канал доставки недоступен",
        )
        reminder.status = CardDeadlineReminder.Status.INVALID_CHANNEL
        reminder.scheduled_at = None
        reminder.schedule_token = None
        reminder.last_error = reason
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
    # A reschedule is a fresh start: failed attempts against the previous
    # schedule must not count toward the new one's retry budget.
    reminder.attempts = 0
    reminder.next_attempt_at = None
    reminder.save(
        update_fields=[
            "enabled",
            "status",
            "scheduled_at",
            "schedule_token",
            "last_error",
            "sent_at",
            "attempts",
            "next_attempt_at",
            "updated_at",
            "version",
        ]
    )

    # No broker-side ETA here on purpose. Celery's `eta` keeps the message in
    # the worker's memory until it fires, which occupies a prefetch slot for
    # the whole wait and loses the reminder whenever the worker restarts.
    # The DB row above is the source of truth; the dispatcher polls it every
    # tick and delivers the reminder once it comes due.
    return reminder
