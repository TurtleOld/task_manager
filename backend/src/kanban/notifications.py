from __future__ import annotations

from typing import Any

from django.conf import settings
from django.contrib.auth import get_user_model
from django.contrib.auth.models import AbstractUser
from django.db import transaction

from .models import Board, Card, Column, NotificationEvent, NotificationEventType
from .tasks import send_notification_event

User = get_user_model()


def build_frontend_link(board_id: int | None) -> str:
    base = settings.FRONTEND_BASE_URL.rstrip("/")
    if board_id:
        return f"{base}/boards/{board_id}"
    return f"{base}/"


def create_notification_event(
    *,
    event_type: NotificationEventType | str,
    actor: AbstractUser | None,
    board: Board | None,
    column: Column | None = None,
    card: Card | None = None,
    summary: str,
    link: str | None = None,
    payload: dict[str, Any] | None = None,
) -> NotificationEvent:
    event = NotificationEvent.objects.create(
        event_type=event_type,
        actor=actor,
        board=board,
        column=column,
        card=card,
        summary=summary,
        link=link or build_frontend_link(board.id if board else None),
        payload=payload or {},
    )
    transaction.on_commit(lambda: send_notification_event.delay(event.id))
    return event

