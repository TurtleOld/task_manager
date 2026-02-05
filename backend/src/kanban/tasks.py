from __future__ import annotations

import json
from urllib import request

from celery import shared_task
from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.mail import send_mail
from django.utils import timezone
from django.utils.text import Truncator

from .models import (
    NotificationChannel,
    NotificationDelivery,
    NotificationEvent,
    NotificationPreference,
    NotificationProfile,
)

User = get_user_model()


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
    with request.urlopen(req, timeout=10) as resp:
        if resp.status >= 400:
            raise RuntimeError(f"Telegram API error: {resp.status}")


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

    subject = Truncator(_event_title(event)).chars(120)
    body = _event_body(event)

    for user in users:
        profile = profiles.get(user.id)
        if not profile:
            profile = NotificationProfile.objects.create(user=user)

        for channel in [NotificationChannel.EMAIL, NotificationChannel.TELEGRAM]:
            if not _preferences_enabled(user.id, event, channel):
                continue

            if channel == NotificationChannel.EMAIL:
                if not profile.email:
                    continue
                delivery = NotificationDelivery.objects.create(
                    event=event,
                    user=user,
                    channel=channel,
                )
                try:
                    _send_email(profile.email, subject, body)
                    delivery.status = NotificationDelivery.Status.SENT
                    delivery.sent_at = timezone.now()
                    delivery.save(update_fields=["status", "sent_at"])
                except Exception as exc:  # noqa: BLE001
                    delivery.status = NotificationDelivery.Status.FAILED
                    delivery.error = str(exc)
                    delivery.save(update_fields=["status", "error"])
                    continue

            if channel == NotificationChannel.TELEGRAM:
                if not profile.telegram_chat_id:
                    continue
                delivery = NotificationDelivery.objects.create(
                    event=event,
                    user=user,
                    channel=channel,
                )
                try:
                    _send_telegram(profile.telegram_chat_id, body)
                    delivery.status = NotificationDelivery.Status.SENT
                    delivery.sent_at = timezone.now()
                    delivery.save(update_fields=["status", "sent_at"])
                except Exception as exc:  # noqa: BLE001
                    delivery.status = NotificationDelivery.Status.FAILED
                    delivery.error = str(exc)
                    delivery.save(update_fields=["status", "error"])
                    continue
