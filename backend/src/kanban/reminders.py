from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta

from django.db.models import QuerySet
from django.utils import timezone

from .models import (
    Card,
    CardDeadlineReminder,
    NotificationChannel,
    NotificationPreference,
    NotificationProfile,
    PersonalDeliveryChannel,
    PushDevice,
    TelegramAccount,
    TelegramDeliveryTarget,
)


@dataclass(frozen=True)
class ChannelAvailability:
    available: bool
    reason: str


EXTERNAL_DELIVERY_OFF = "Внешние уведомления выключены"


def preferences_enabled_for_event_type(
    *,
    user_id: int,
    board_id: int | None,
    channel: str,
    event_type: str,
) -> bool:
    """Whether `event_type` is enabled for this person.

    Board scope beats global scope. Within a scope a row for the exact channel
    wins, otherwise the person's existing row for any channel applies, so
    switching Push → Telegram does not re-enable what they turned off. No
    preference at all means enabled.
    """

    def decide(rows: QuerySet[NotificationPreference]) -> bool | None:
        if not rows.exists():
            return None
        exact = rows.filter(channel=channel).first()
        if exact is not None:
            return exact.enabled
        return rows.first().enabled

    rows = NotificationPreference.objects.filter(user_id=user_id, event_type=event_type)
    if board_id:
        decided = decide(rows.filter(board_id=board_id))
        if decided is not None:
            return decided
    decided = decide(rows.filter(board__isnull=True))
    return True if decided is None else decided


def reminder_channel_availability(
    *, user_id: int, board_id: int | None, event_type: str
) -> dict[str, ChannelAvailability]:
    """Availability of each delivery channel for a person.

    Exactly the chosen personal channel is available (when it has a
    destination); the other channel reports an empty reason, meaning "not the
    chosen channel" rather than an error.
    """

    profile = NotificationProfile.objects.filter(user_id=user_id).first()
    chosen = profile.delivery_channel if profile else PersonalDeliveryChannel.PUSH

    if chosen == PersonalDeliveryChannel.DISABLED:
        return {
            NotificationChannel.PUSH.value: ChannelAvailability(False, EXTERNAL_DELIVERY_OFF),
            NotificationChannel.TELEGRAM.value: ChannelAvailability(False, EXTERNAL_DELIVERY_OFF),
        }

    if chosen == PersonalDeliveryChannel.TELEGRAM:
        return {
            NotificationChannel.PUSH.value: ChannelAvailability(False, ""),
            NotificationChannel.TELEGRAM.value: telegram_availability(
                user_id=user_id,
                board_id=board_id,
                event_type=event_type,
            ),
        }

    return {
        NotificationChannel.PUSH.value: push_availability(
            user_id=user_id,
            board_id=board_id,
            event_type=event_type,
        ),
        NotificationChannel.TELEGRAM.value: ChannelAvailability(False, ""),
    }


def push_availability(
    *, user_id: int, board_id: int | None, event_type: str
) -> ChannelAvailability:
    if not preferences_enabled_for_event_type(
        user_id=user_id,
        board_id=board_id,
        channel=NotificationChannel.PUSH.value,
        event_type=event_type,
    ):
        return ChannelAvailability(False, "Push отключён в настройках уведомлений")
    # Any one active device with a live session is enough.
    if not PushDevice.objects.filter(user_id=user_id, active=True).live().exists():
        return ChannelAvailability(False, "Нет подключённых устройств")
    return ChannelAvailability(True, "")


def telegram_availability(
    *, user_id: int, board_id: int | None, event_type: str
) -> ChannelAvailability:
    if not preferences_enabled_for_event_type(
        user_id=user_id,
        board_id=board_id,
        channel=NotificationChannel.TELEGRAM.value,
        event_type=event_type,
    ):
        return ChannelAvailability(False, "Telegram отключён в настройках уведомлений")
    if not TelegramAccount.objects.filter(user_id=user_id).exists():
        return ChannelAvailability(False, "Telegram не подключён")
    return ChannelAvailability(True, "")


def switch_family_recipients_to_personal(*, reason: str) -> int:
    """Re-home everyone on the family chat to their personal chat.

    The switch is recorded with a timestamp so pending events from the group
    era are not re-delivered personally, and the reason is surfaced in
    settings. Returns how many profiles were switched.
    """

    now = timezone.now()
    return NotificationProfile.objects.filter(
        delivery_channel=PersonalDeliveryChannel.TELEGRAM,
        telegram_target=TelegramDeliveryTarget.FAMILY,
    ).update(
        telegram_target=TelegramDeliveryTarget.PERSONAL,
        telegram_target_changed_at=now,
        telegram_target_reason=reason,
    )


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
            (item.reason for item in availability.values() if not item.available and item.reason),
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

    # The DB row above is the source of truth; the dispatcher polls it every
    # tick and delivers the reminder once it comes due. Nothing is scheduled in
    # memory, so a restart cannot drop a pending reminder.
    return reminder


def reschedule_enabled_reminders(*, card: Card) -> None:
    """Recompute every enabled reminder on a card against its current deadline."""

    reminders = CardDeadlineReminder.objects.filter(card_id=card.id, enabled=True)
    for reminder in reminders:
        upsert_and_schedule_reminder(card=card, reminder=reminder)


def reschedule_invalid_channel_reminders(*, user_id: int) -> None:
    """Retry every reminder stranded by a missing channel for this user.

    A device registering or coming back active makes push available again,
    but nothing else re-evaluates reminders already stuck in
    INVALID_CHANNEL, so they would otherwise never fire.
    """

    reminders = CardDeadlineReminder.objects.filter(
        user_id=user_id,
        enabled=True,
        status=CardDeadlineReminder.Status.INVALID_CHANNEL,
    ).select_related("card")
    for reminder in reminders:
        upsert_and_schedule_reminder(card=reminder.card, reminder=reminder)


def skip_reminders_for_completed_card(*, card_id: int) -> None:
    """Stop a scheduled reminder from firing about a task that is already done."""

    reminders = CardDeadlineReminder.objects.filter(
        card_id=card_id, status=CardDeadlineReminder.Status.SCHEDULED
    )
    for reminder in reminders:
        reminder.status = CardDeadlineReminder.Status.SKIPPED
        reminder.scheduled_at = None
        reminder.schedule_token = None
        reminder.last_error = "Пропущено: задача уже выполнена"
        reminder.next_attempt_at = None
        reminder.save(
            update_fields=[
                "status",
                "scheduled_at",
                "schedule_token",
                "last_error",
                "next_attempt_at",
                "updated_at",
                "version",
            ]
        )
