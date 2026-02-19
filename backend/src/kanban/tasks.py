from __future__ import annotations

import json
import logging
from datetime import datetime
from urllib import request
from urllib.error import HTTPError, URLError
from zoneinfo import ZoneInfo

from celery import shared_task
from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.mail import send_mail
from django.db.utils import IntegrityError
from django.utils import timezone
from django.utils.text import Truncator

from .models import (
    Card,
    CardDeadlineReminder,
    CardDeadlineReminderDelivery,
    NotificationChannel,
    NotificationDelivery,
    NotificationEvent,
    NotificationPreference,
    NotificationProfile,
)
from .reminders import reminder_channel_availability, resolve_delivery_channel

User = get_user_model()

logger = logging.getLogger(__name__)


def _ru_plural(value: int, forms: tuple[str, str, str]) -> str:
    # forms: (one, few, many) e.g. ("минута", "минуты", "минут")
    n = abs(int(value))
    if n % 10 == 1 and n % 100 != 11:
        return forms[0]
    if 2 <= n % 10 <= 4 and not (12 <= n % 100 <= 14):
        return forms[1]
    return forms[2]


def _format_offset_ru(*, value: int, unit: str) -> str:
    if unit == CardDeadlineReminder.Unit.HOURS:
        word = _ru_plural(value, ("час", "часа", "часов"))
        return f"за {value} {word} до срока"
    word = _ru_plural(value, ("минуту", "минуты", "минут"))
    return f"за {value} {word} до срока"


def _format_deadline_ru(*, dt: datetime, tz_name: str) -> str:
    try:
        tz = ZoneInfo(tz_name or "UTC")
    except Exception:  # noqa: BLE001
        tz = ZoneInfo("UTC")
    local = timezone.localtime(dt, tz)
    return local.strftime("%d.%m.%Y %H:%M")


def _build_card_link(*, card: Card) -> str:
    base = settings.FRONTEND_BASE_URL.rstrip("/")
    # Frontend has a board page; we include a fragment with card id for quick manual search.
    return f"{base}/boards/{card.board_id}#card-{card.id}"


@shared_task(bind=True, max_retries=5, default_retry_delay=60)
def send_card_deadline_reminder(self, reminder_id: int, schedule_token: str) -> None:
    reminder = (
        CardDeadlineReminder.objects.filter(id=reminder_id).select_related("card", "user").first()
    )
    if not reminder:
        return

    # Skip outdated enqueued tasks after reschedule.
    if not reminder.schedule_token or str(reminder.schedule_token) != str(schedule_token):
        return

    card = Card.objects.filter(id=reminder.card_id).first()
    if not card or not card.deadline:
        reminder.status = CardDeadlineReminder.Status.INVALID_NO_DEADLINE
        reminder.scheduled_at = None
        reminder.schedule_token = None
        reminder.save(
            update_fields=[
                "status",
                "scheduled_at",
                "schedule_token",
                "updated_at",
                "version",
            ]
        )
        return

    availability = reminder_channel_availability(
        user_id=reminder.user_id,
        board_id=card.board_id,
        event_type="card.deadline_reminder",
    )
    channel = resolve_delivery_channel(reminder=reminder, availability=availability)
    if not channel:
        reminder.status = CardDeadlineReminder.Status.INVALID_CHANNEL
        reminder.scheduled_at = None
        reminder.schedule_token = None
        reminder.save(
            update_fields=[
                "status",
                "scheduled_at",
                "schedule_token",
                "updated_at",
                "version",
            ]
        )
        return

    # Idempotency: one delivery per (reminder, schedule_token).
    dedupe_key = f"card.deadline_reminder:{reminder.id}:{schedule_token}"
    try:
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
    except IntegrityError:
        delivery = CardDeadlineReminderDelivery.objects.get(dedupe_key=dedupe_key)

    if delivery.status == CardDeadlineReminderDelivery.Status.SENT:
        return

    # Mark processing (safe on retries)
    if delivery.status != CardDeadlineReminderDelivery.Status.PROCESSING:
        delivery.status = CardDeadlineReminderDelivery.Status.PROCESSING
        delivery.started_at = timezone.now()
        delivery.save(update_fields=["status", "started_at"])

    profile, _ = NotificationProfile.objects.get_or_create(user_id=reminder.user_id)
    offset_text = _format_offset_ru(value=reminder.offset_value, unit=reminder.offset_unit)
    deadline_text = _format_deadline_ru(dt=card.deadline, tz_name=profile.timezone)
    link = _build_card_link(card=card)

    subject = f"Напоминание: {card.title}"
    body_lines = [
        f"Напоминание по задаче: {card.title}",
        f"Дедлайн: {deadline_text}",
        f"Интервал: {offset_text}",
        "",
        f"Открыть задачу: {link}",
    ]
    body = "\n".join(body_lines)

    try:
        if channel == NotificationChannel.EMAIL:
            if not profile.email:
                raise RuntimeError("Email is not configured")
            _send_email(profile.email, subject, body)
        elif channel == NotificationChannel.TELEGRAM:
            if not profile.telegram_chat_id:
                raise RuntimeError("Telegram chat_id is not configured")
            _send_telegram(profile.telegram_chat_id, body)
        else:
            raise RuntimeError(f"Unsupported channel: {channel}")

        delivery.status = CardDeadlineReminderDelivery.Status.SENT
        delivery.sent_at = timezone.now()
        delivery.save(update_fields=["status", "sent_at"])

        reminder.status = CardDeadlineReminder.Status.SENT
        reminder.sent_at = delivery.sent_at
        reminder.last_error = ""
        reminder.save(update_fields=["status", "sent_at", "last_error", "updated_at", "version"])
    except Exception as exc:  # noqa: BLE001
        delivery.status = CardDeadlineReminderDelivery.Status.FAILED
        delivery.error = str(exc)
        delivery.save(update_fields=["status", "error"])

        reminder.status = CardDeadlineReminder.Status.FAILED
        reminder.last_error = str(exc)
        reminder.save(update_fields=["status", "last_error", "updated_at", "version"])
        raise self.retry(exc=exc)


def _event_title(event: NotificationEvent) -> str:
    actor = event.actor
    actor_name = (actor.first_name or actor.username) if actor else "Система"
    return f"{actor_name}: {event.summary}"


def _event_body(event: NotificationEvent) -> str:
    payload = event.payload or {}
    board = payload.get("board") or (event.board.name if event.board else "")
    column = payload.get("column") or (event.column.name if event.column else "")
    card = payload.get("card") or (event.card.title if event.card else "")
    lines = [
        event.summary,
        "",
    ]
    if board:
        lines.append(f"Доска: {board}")
    if column:
        lines.append(f"Колонка: {column}")
    if card:
        lines.append(f"Карточка: {card}")
    if event.link:
        lines.extend(["", f"Перейти: {event.link}"])
    return "\n".join(lines)


def _send_email(to_email: str, subject: str, body: str) -> None:
    send_mail(
        subject=subject,
        message=body,
        from_email=settings.DEFAULT_FROM_EMAIL,
        recipient_list=[to_email],
        fail_silently=False,
    )


def _send_telegram(chat_id: str, message: str) -> None:
    token = settings.TELEGRAM_BOT_TOKEN
    if not token:
        raise RuntimeError("TELEGRAM_BOT_TOKEN is not configured")
    payload = json.dumps({"chat_id": chat_id, "text": message}).encode("utf-8")
    req = request.Request(
        url=f"https://api.telegram.org/bot{token}/sendMessage",
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with request.urlopen(req, timeout=10) as resp:
            if resp.status >= 400:
                raise RuntimeError(f"Telegram API error: HTTP {resp.status}")
    except HTTPError as exc:
        # Telegram API usually returns a JSON body like:
        # {"ok":false,"error_code":403,"description":"Forbidden: bot was blocked by the user"}
        body = ""
        try:
            body = exc.read().decode("utf-8", errors="replace")
        except Exception:  # noqa: BLE001
            body = "<failed to read response body>"
        logger.warning("Telegram API HTTPError: status=%s body=%s", exc.code, body)
        raise RuntimeError(f"Telegram API error: HTTP {exc.code}; body={body}") from exc
    except URLError as exc:
        logger.warning("Telegram API URLError: %s", exc)
        raise RuntimeError(f"Telegram API connection error: {exc}") from exc


def _preferences_enabled(user_id: int, event: NotificationEvent, channel: str) -> bool:
    qs = NotificationPreference.objects.filter(
        user_id=user_id,
        channel=channel,
        event_type=event.event_type,
    )
    if event.board_id:
        board_qs = qs.filter(board_id=event.board_id)
        if board_qs.exists():
            return bool(board_qs.filter(enabled=True).exists())
    global_qs = qs.filter(board__isnull=True)
    if global_qs.exists():
        return bool(global_qs.filter(enabled=True).exists())
    return True


@shared_task(bind=True, max_retries=3, default_retry_delay=30)
def send_notification_event(self, event_id: int) -> None:
    event = (
        NotificationEvent.objects.filter(id=event_id)
        .select_related("actor", "board", "column", "card")
        .first()
    )
    if not event:
        return

    users = User.objects.all().order_by("id")
    profiles = {p.user_id: p for p in NotificationProfile.objects.filter(user__in=users)}

    board = event.board if event.board_id else None
    board_override = False
    board_email = ""
    board_telegram = ""
    if board:
        board_email = (board.notification_email or "").strip()
        board_telegram = (board.notification_telegram_chat_id or "").strip()
        board_override = bool(board_email or board_telegram)

    subject = Truncator(_event_title(event)).chars(120)
    body = _event_body(event)

    for user in users:
        profile = profiles.get(user.id)
        if not profile:
            profile = NotificationProfile.objects.create(user=user)

        for channel in [NotificationChannel.EMAIL, NotificationChannel.TELEGRAM]:
            channel_value = channel[0] if isinstance(channel, tuple) else channel
            if not _preferences_enabled(user.id, event, channel_value):
                continue

            if channel_value == NotificationChannel.EMAIL:
                target_email = board_email if board_override else profile.email
                if not target_email:
                    continue
                delivery = NotificationDelivery.objects.create(
                    event=event,
                    user=user,
                    channel=channel,
                )
                try:
                    _send_email(target_email, subject, body)
                    delivery.status = NotificationDelivery.Status.SENT
                    delivery.sent_at = timezone.now()
                    delivery.save(update_fields=["status", "sent_at"])
                except Exception as exc:  # noqa: BLE001
                    delivery.status = NotificationDelivery.Status.FAILED
                    delivery.error = str(exc)
                    delivery.save(update_fields=["status", "error"])
                    continue

            if channel_value == NotificationChannel.TELEGRAM:
                target_chat = board_telegram if board_override else profile.telegram_chat_id
                if not target_chat:
                    continue
                delivery = NotificationDelivery.objects.create(
                    event=event,
                    user=user,
                    channel=channel,
                )
                try:
                    _send_telegram(target_chat, body)
                    delivery.status = NotificationDelivery.Status.SENT
                    delivery.sent_at = timezone.now()
                    delivery.save(update_fields=["status", "sent_at"])
                except Exception as exc:  # noqa: BLE001
                    delivery.status = NotificationDelivery.Status.FAILED
                    delivery.error = str(exc)
                    delivery.save(update_fields=["status", "error"])
                    continue
