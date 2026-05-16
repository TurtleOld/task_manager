from __future__ import annotations

from typing import Any, cast

from django.conf import settings
from django.contrib.auth import get_user_model
from django.contrib.auth.models import AbstractUser
from django.db import transaction
from django.db.utils import IntegrityError

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
    dedupe_key: str | None = None,
) -> NotificationEvent:
    defaults = {
        "event_type": event_type,
        "actor": actor,
        "board": board,
        "column": column,
        "card": card,
        "summary": summary,
        "link": link or build_frontend_link(cast(int | None, getattr(board, "pk", None))),
        "payload": payload or {},
    }

    # `dedupe_key` is optional. When it is present we want idempotency.
    #
    # IMPORTANT: catching an IntegrityError from a plain `.create()` inside an
    # outer `transaction.atomic()` breaks the transaction ("needs_rollback").
    # Using `get_or_create()` keeps the retry within a savepoint so the caller
    # transaction remains usable.
    if dedupe_key:
        try:
            event, created = NotificationEvent.objects.get_or_create(
                dedupe_key=dedupe_key,
                defaults={**defaults, "dedupe_key": dedupe_key},
            )
        except IntegrityError:
            # Extremely rare race: insert succeeded elsewhere between our
            # SELECT and INSERT. Fetch the existing event.
            event = NotificationEvent.objects.get(dedupe_key=dedupe_key)
            created = False
    else:
        event = NotificationEvent.objects.create(**defaults, dedupe_key=None)
        created = True

    if created:
        # `send_notification_event` is a Celery task; type-checkers may not understand `.delay`.
        task = cast(Any, send_notification_event)
        transaction.on_commit(lambda: task.delay(cast(int, getattr(event, "pk", None))))
    return event
