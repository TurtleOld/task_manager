"""The notification dispatcher: PostgreSQL is the queue.

Why not Celery. The schedule already lived in the database — a reminder fires
because `CardDeadlineReminder.scheduled_at` says so, not because a broker holds
a delayed message. Celery contributed only "run this now", and paid for it with
a Redis instance in the critical path plus three long-running containers. Worse,
the hand-off itself could lose work: `transaction.on_commit(task.delay(...))`
runs *after* the commit, so a broker hiccup at that instant dropped the event
with the database already claiming it happened.

What replaces it is a single loop that re-reads state every tick. Rows are
claimed with `SELECT ... FOR UPDATE SKIP LOCKED`, so running two dispatchers is
safe; a crash mid-send leaves a row in PROCESSING which the next pass recovers;
and downtime is caught up automatically because nothing lives in memory.

Ordering note: reminders are handled before outbox events. A deadline that has
already passed is the one notification a person actually planned their day
around.
"""

from __future__ import annotations

import logging
from datetime import timedelta
from typing import Any

from django.conf import settings
from django.contrib.auth import get_user_model
from django.db import transaction
from django.db.models import Q
from django.utils import timezone
from django.utils.text import Truncator

from .models import (
    Card,
    CardDeadlineReminder,
    CardDeadlineReminderDelivery,
    DispatcherHeartbeat,
    NotificationChannel,
    NotificationDelivery,
    NotificationEvent,
    NotificationEventType,
    NotificationInboxEntry,
    NotificationProfile,
)
from .push_delivery import send_push_to_user
from .reminders import (
    preferences_enabled_for_event_type,
    reminder_channel_availability,
    resolve_delivery_channel,
)

User = get_user_model()

logger = logging.getLogger(__name__)

# A reminder whose moment passed longer ago than this is dropped rather than
# delivered. Waking someone at 03:00 about a deadline from Tuesday is worse
# than staying quiet.
REMINDER_STALE_MINUTES = 120


def _backoff(attempts: int) -> timedelta:
    """Exponential backoff, capped. 1m, 2m, 4m, 8m, 16m, then 30m."""

    return timedelta(seconds=min(60 * (2**attempts), 1800))


# --------------------------------------------------------------------------
# Deadline reminders
# --------------------------------------------------------------------------


def _reminder_message(reminder: CardDeadlineReminder, card: Card) -> tuple[str, str, str]:
    from .tasks import _build_card_link, _format_deadline_ru, _format_offset_ru

    profile, _ = NotificationProfile.objects.get_or_create(user_id=reminder.user_id)
    offset_text = _format_offset_ru(value=reminder.offset_value, unit=reminder.offset_unit)
    deadline_text = _format_deadline_ru(dt=card.deadline, tz_name=profile.timezone)
    link = _build_card_link(card=card)

    subject = f"Напоминание: {card.title}"
    body = "\n".join(
        [
            f"Напоминание по задаче: {card.title}",
            f"Дедлайн: {deadline_text}",
            f"Интервал: {offset_text}",
            "",
            f"Открыть задачу: {link}",
        ]
    )
    return subject, body, link


def _deliver_reminder_on_channel(
    *,
    reminder: CardDeadlineReminder,
    card: Card,
    channel: str,
    subject: str,
    body: str,
    link: str,
) -> None:
    """Send one reminder. Raises on failure so the caller can schedule a retry."""

    if channel == NotificationChannel.PUSH:
        result = send_push_to_user(
            user_id=reminder.user_id,
            title=subject,
            body=body,
            link=link,
            # Re-sending about the same task replaces the previous card in the
            # notification shade instead of stacking duplicates.
            tag=f"card-{card.id}",
            data={
                "eventType": NotificationEventType.CARD_DEADLINE_REMINDER.value,
                "cardId": str(card.id),
                "boardId": str(card.board_id or ""),
            },
        )
        if not result.delivered:
            raise RuntimeError(f"Push не доставлен — {result.summary()}")
        return

    raise RuntimeError(f"Неизвестный канал доставки: {channel}")


def _finalize_reminder(
    reminder: CardDeadlineReminder,
    *,
    # `CardDeadlineReminder.Status` members are `str` at runtime, but mypy
    # models Django's TextChoices members as tuples, so the annotation stays
    # loose rather than forcing `.value` at every call site.
    status: Any,
    error: str = "",
) -> None:
    reminder.status = status
    reminder.last_error = error
    reminder.scheduled_at = None if status.startswith("invalid") else reminder.scheduled_at
    reminder.next_attempt_at = None
    reminder.save(
        update_fields=[
            "status",
            "last_error",
            "scheduled_at",
            "next_attempt_at",
            "updated_at",
            "version",
        ]
    )


def process_due_reminders(*, now=None, limit: int | None = None) -> int:
    """Deliver every reminder whose moment has arrived. Returns how many were sent."""

    now = now or timezone.now()
    limit = limit or settings.DISPATCHER_BATCH_SIZE
    stale_before = now - timedelta(minutes=REMINDER_STALE_MINUTES)
    sent = 0

    due_ids = list(
        CardDeadlineReminder.objects.filter(
            enabled=True,
            status=CardDeadlineReminder.Status.SCHEDULED,
            scheduled_at__isnull=False,
            scheduled_at__lte=now,
        )
        # Never attempted, or the retry backoff has elapsed.
        .filter(Q(next_attempt_at__isnull=True) | Q(next_attempt_at__lte=now))
        .order_by("scheduled_at", "id")
        .values_list("id", flat=True)[:limit]
    )

    for reminder_id in due_ids:
        with transaction.atomic():
            reminder = (
                CardDeadlineReminder.objects.select_for_update(skip_locked=True)
                .filter(id=reminder_id, status=CardDeadlineReminder.Status.SCHEDULED)
                .select_related("card")
                .first()
            )
            if not reminder or not reminder.scheduled_at:
                continue

            if reminder.scheduled_at < stale_before:
                _finalize_reminder(
                    reminder,
                    status=CardDeadlineReminder.Status.SKIPPED,
                    error="Пропущено: время напоминания давно прошло",
                )
                logger.warning(
                    "reminder_skipped_stale reminder=%s scheduled_at=%s",
                    reminder.id,
                    reminder.scheduled_at,
                )
                continue

            card = Card.objects.filter(id=reminder.card_id).first()
            if not card or not card.deadline:
                _finalize_reminder(reminder, status=CardDeadlineReminder.Status.INVALID_NO_DEADLINE)
                continue

            availability = reminder_channel_availability(
                user_id=reminder.user_id,
                board_id=card.board_id,
                event_type=NotificationEventType.CARD_DEADLINE_REMINDER.value,
            )
            channel = resolve_delivery_channel(reminder=reminder, availability=availability)
            if not channel:
                _finalize_reminder(
                    reminder,
                    status=CardDeadlineReminder.Status.INVALID_CHANNEL,
                    error="Нет подключённых устройств для получения напоминания",
                )
                continue

            # One delivery row per (reminder, schedule_token): a retry after a
            # partial failure must not notify the person a second time.
            dedupe_key = f"card.deadline_reminder:{reminder.id}:{reminder.schedule_token}"
            delivery, _created = CardDeadlineReminderDelivery.objects.get_or_create(
                dedupe_key=dedupe_key,
                defaults={
                    "reminder_id": reminder.id,
                    "card_id": card.id,
                    "user_id": reminder.user_id,
                    "channel": channel,
                    "status": CardDeadlineReminderDelivery.Status.QUEUED,
                },
            )
            if delivery.status == CardDeadlineReminderDelivery.Status.SENT:
                _finalize_reminder(reminder, status=CardDeadlineReminder.Status.SENT)
                continue

            subject, body, link = _reminder_message(reminder, card)

            try:
                _deliver_reminder_on_channel(
                    reminder=reminder,
                    card=card,
                    channel=channel,
                    subject=subject,
                    body=body,
                    link=link,
                )
            except Exception as exc:  # noqa: BLE001 - every failure is recorded, none escape
                reminder.attempts += 1
                delivery.status = CardDeadlineReminderDelivery.Status.FAILED
                delivery.error = str(exc)[:500]
                delivery.save(update_fields=["status", "error"])

                if reminder.attempts >= settings.DISPATCHER_MAX_ATTEMPTS:
                    reminder.status = CardDeadlineReminder.Status.FAILED
                    reminder.next_attempt_at = None
                    logger.error(
                        "reminder_failed_permanently reminder=%s attempts=%s error=%s",
                        reminder.id,
                        reminder.attempts,
                        exc,
                    )
                else:
                    # Stay SCHEDULED so the next pass retries it.
                    reminder.next_attempt_at = now + _backoff(reminder.attempts)
                reminder.last_error = str(exc)[:500]
                reminder.save(
                    update_fields=[
                        "status",
                        "attempts",
                        "next_attempt_at",
                        "last_error",
                        "updated_at",
                        "version",
                    ]
                )
                continue

            delivery.status = CardDeadlineReminderDelivery.Status.SENT
            delivery.sent_at = timezone.now()
            delivery.save(update_fields=["status", "sent_at"])

            reminder.status = CardDeadlineReminder.Status.SENT
            reminder.sent_at = delivery.sent_at
            reminder.last_error = ""
            reminder.next_attempt_at = None
            reminder.save(
                update_fields=[
                    "status",
                    "sent_at",
                    "last_error",
                    "next_attempt_at",
                    "updated_at",
                    "version",
                ]
            )
            sent += 1

    return sent


# --------------------------------------------------------------------------
# Notification events (transactional outbox)
# --------------------------------------------------------------------------


# Comment is the one event type its author does not get back: they just wrote
# the text and are looking at it on screen. Every other event type addresses
# the actor the same as any other recipient. Excluding it here — in address
# resolution — rather than in the delivery loop also removes the author from
# the inbox for their own comment, not just from push. That is intentional
# and matches how a mentioning comment already behaves today: the author is
# never in `mention_user_ids`, so they already get no inbox entry for it. A
# comment without a mention now behaves the same way instead of differently.
EVENT_TYPES_WITHOUT_ACTOR = {NotificationEventType.COMMENT_CREATED.value}


def _event_recipients(event: NotificationEvent) -> list[int]:
    """Users this event is addressed to (mentions narrow it down).

    Every recipient returned here gets both the in-app inbox entry and device
    delivery — the two are no longer split. A comment additionally drops its
    own author, see `EVENT_TYPES_WITHOUT_ACTOR`.
    """

    mention_user_ids = (
        event.payload.get("mention_user_ids") if isinstance(event.payload, dict) else None
    )
    qs = User.objects.all().order_by("id")
    if isinstance(mention_user_ids, list) and mention_user_ids:
        mentioned = {int(item) for item in mention_user_ids if str(item).isdigit()}
        if not mentioned:
            return []
        qs = qs.filter(id__in=mentioned)
    recipient_ids = list(qs.values_list("id", flat=True))
    if event.event_type in EVENT_TYPES_WITHOUT_ACTOR:
        recipient_ids = [uid for uid in recipient_ids if uid != event.actor_id]
    return recipient_ids


def _event_title(event: NotificationEvent) -> str:
    actor = event.actor
    actor_name = (actor.first_name or actor.username) if actor else "Система"
    return f"{actor_name}: {event.summary}"


def _event_body(event: NotificationEvent) -> str:
    payload = event.payload or {}
    board = payload.get("board") or (event.board.name if event.board else "")
    card = payload.get("card") or (event.card.title if event.card else "")
    lines = [
        event.summary,
        "",
    ]
    if board:
        lines.append(f"Список: {board}")
    if card:
        lines.append(f"Задача: {card}")
    if event.link:
        lines.extend(["", f"Перейти: {event.link}"])
    return "\n".join(lines)


def _deliver_event_to_user(event: NotificationEvent, user_id: int) -> None:
    """Deliver one event to one person's devices over Web Push.

    The actor is a recipient like any other here — with two people sharing a
    board, a notification about your own action confirms it reached the other
    device instead of being noise. `_event_recipients()` is the only place
    that excludes anyone (currently just a comment's own author), so this
    function writes the device delivery record for whoever it is given. The
    inbox entry is written separately and unconditionally.
    """

    if not preferences_enabled_for_event_type(
        user_id=user_id,
        board_id=event.board_id,
        channel=NotificationChannel.PUSH.value,
        event_type=event.event_type,
    ):
        return

    subject = str(Truncator(_event_title(event)).chars(120))
    body = _event_body(event)

    result = send_push_to_user(
        user_id=user_id,
        title=subject,
        body=body,
        link=event.link,
        tag=f"card-{event.card_id}" if event.card_id else f"event-{event.id}",
        data={
            "eventType": event.event_type,
            "cardId": str(event.card_id or ""),
            "boardId": str(event.board_id or ""),
        },
    )

    if result.no_devices:
        # Not an error: this person simply has no push devices yet.
        return

    delivery = NotificationDelivery.objects.create(
        event=event, user_id=user_id, channel=NotificationChannel.PUSH.value
    )
    if result.delivered:
        delivery.status = NotificationDelivery.Status.SENT
        delivery.sent_at = timezone.now()
    else:
        delivery.status = NotificationDelivery.Status.FAILED
        delivery.error = result.summary()[:500]
    delivery.save(update_fields=["status", "sent_at", "error"])


def process_outbox_events(*, now=None, limit: int | None = None) -> int:
    """Deliver pending notification events. Returns how many were processed."""

    now = now or timezone.now()
    limit = limit or settings.DISPATCHER_BATCH_SIZE
    processed = 0

    pending_ids = list(
        NotificationEvent.objects.filter(
            dispatch_status=NotificationEvent.Dispatch.PENDING,
            next_attempt_at__lte=now,
        )
        .order_by("next_attempt_at", "id")
        .values_list("id", flat=True)[:limit]
    )

    for event_id in pending_ids:
        with transaction.atomic():
            # `actor`, `board`, `column` and `card` are all nullable FKs
            # (`on_delete=SET_NULL`), so `select_related` on them compiles to a
            # LEFT OUTER JOIN. Postgres refuses `FOR UPDATE` on the nullable
            # side of an outer join ("FeatureNotSupported"), so the lock must
            # be scoped to this table alone with `of=("self",)` — otherwise
            # every tick raises and no event is ever dispatched.
            event = (
                NotificationEvent.objects.select_for_update(skip_locked=True, of=("self",))
                .filter(id=event_id, dispatch_status=NotificationEvent.Dispatch.PENDING)
                .select_related("actor", "board", "column", "card")
                .first()
            )
            if not event:
                continue

            event.dispatch_status = NotificationEvent.Dispatch.PROCESSING
            event.dispatch_started_at = now
            event.save(update_fields=["dispatch_status", "dispatch_started_at"])

        # Outside the lock: sending talks to the network and must not hold a
        # row lock for the duration.
        try:
            recipient_ids = _event_recipients(event)

            # The in-app inbox is written first and unconditionally: it touches
            # nothing external, so it must not depend on push succeeding. Every
            # recipient gets an entry, including the actor.
            NotificationInboxEntry.objects.bulk_create(
                [NotificationInboxEntry(event=event, user_id=uid) for uid in recipient_ids],
                ignore_conflicts=True,
            )

            for user_id in recipient_ids:
                _deliver_event_to_user(event, user_id)
        except Exception as exc:  # noqa: BLE001
            event.dispatch_attempts += 1
            event.dispatch_error = str(exc)[:500]
            if event.dispatch_attempts >= settings.DISPATCHER_MAX_ATTEMPTS:
                event.dispatch_status = NotificationEvent.Dispatch.FAILED
                logger.error("event_dispatch_failed_permanently event=%s error=%s", event.id, exc)
            else:
                event.dispatch_status = NotificationEvent.Dispatch.PENDING
                event.next_attempt_at = now + _backoff(event.dispatch_attempts)
            event.save(
                update_fields=[
                    "dispatch_status",
                    "dispatch_attempts",
                    "dispatch_error",
                    "next_attempt_at",
                ]
            )
            continue

        event.dispatch_status = NotificationEvent.Dispatch.DONE
        event.dispatch_error = ""
        event.save(update_fields=["dispatch_status", "dispatch_error"])
        processed += 1

    return processed


# --------------------------------------------------------------------------
# Recovery and heartbeat
# --------------------------------------------------------------------------


def recover_stuck(*, now=None) -> int:
    """Return rows orphaned by a crashed dispatcher to PENDING."""

    now = now or timezone.now()
    cutoff = now - timedelta(minutes=settings.DISPATCHER_STUCK_MINUTES)

    recovered = NotificationEvent.objects.filter(
        dispatch_status=NotificationEvent.Dispatch.PROCESSING,
        dispatch_started_at__lt=cutoff,
    ).update(dispatch_status=NotificationEvent.Dispatch.PENDING, next_attempt_at=now)

    # Legacy status from the Celery era: rows handed to a worker that died.
    recovered += CardDeadlineReminder.objects.filter(
        status=CardDeadlineReminder.Status.DISPATCHED,
        updated_at__lt=cutoff,
    ).update(status=CardDeadlineReminder.Status.SCHEDULED)

    if recovered:
        logger.warning("dispatcher_recovered_stuck count=%s", recovered)
    return recovered


def beat(*, error: str = "") -> None:
    """Record that a pass completed, so the health endpoint can see liveness."""

    heartbeat, _ = DispatcherHeartbeat.objects.get_or_create(name="dispatcher")
    heartbeat.last_tick_at = timezone.now()
    heartbeat.last_error = error[:500]
    heartbeat.ticks += 1
    heartbeat.save(update_fields=["last_tick_at", "last_error", "ticks"])


def tick() -> dict[str, int]:
    """One full pass. Never raises: a bad tick must not kill the loop."""

    now = timezone.now()
    stats = {"recovered": 0, "reminders": 0, "events": 0}
    error = ""

    try:
        stats["recovered"] = recover_stuck(now=now)
        stats["reminders"] = process_due_reminders(now=now)
        stats["events"] = process_outbox_events(now=now)
    except Exception as exc:  # noqa: BLE001 - the loop must survive anything
        error = str(exc)
        logger.exception("dispatcher_tick_failed")

    beat(error=error)
    return stats


# Activity pruning is a monthly-scale chore; running it on the maintenance
# cadence would issue a pointless DELETE every few minutes.
PRUNE_INTERVAL_HOURS = 24


def maintenance_tick() -> None:
    """Everything the Celery beat schedule used to own, except reminders.

    These are the last three periodic jobs, so once they run here the beat and
    worker containers have nothing left to do.
    """

    from .tasks import generate_recurring_cards, prune_card_activity, send_overdue_card_reminders

    try:
        generate_recurring_cards.apply(throw=True)
    except Exception:  # noqa: BLE001 - one failing chore must not skip the rest
        logger.exception("dispatcher_recurring_cards_failed")

    try:
        # Self-rate-limiting: the task skips any card it already notified about
        # within `SiteSettings.overdue_reminder_interval`, so calling it more
        # often than that interval costs a query and sends nothing.
        send_overdue_card_reminders.apply(throw=True)
    except Exception:  # noqa: BLE001
        logger.exception("dispatcher_overdue_reminders_failed")

    heartbeat, _ = DispatcherHeartbeat.objects.get_or_create(name="dispatcher")
    due = heartbeat.last_prune_at is None or heartbeat.last_prune_at < timezone.now() - timedelta(
        hours=PRUNE_INTERVAL_HOURS
    )
    if due:
        try:
            prune_card_activity.apply(throw=True)
        except Exception:  # noqa: BLE001
            logger.exception("dispatcher_prune_activity_failed")
        else:
            heartbeat.last_prune_at = timezone.now()
            heartbeat.save(update_fields=["last_prune_at"])
