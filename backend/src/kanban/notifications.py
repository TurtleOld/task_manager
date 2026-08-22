from __future__ import annotations

import logging
from typing import Any, cast

from django.conf import settings
from django.contrib.auth import get_user_model
from django.contrib.auth.models import AbstractUser
from django.db import connection
from django.db.utils import IntegrityError

from .models import Board, Card, Column, NotificationEvent, NotificationEventType

User = get_user_model()

logger = logging.getLogger(__name__)

# Shared with `run_dispatcher`'s `LISTEN`. Not env-configurable — a channel
# name is an implementation detail, not deployment configuration.
NOTIFICATION_CHANNEL = "kanban_events"


def build_frontend_link(board_id: int | None) -> str:
    base = settings.FRONTEND_BASE_URL.rstrip("/")
    if board_id:
        return f"{base}/lists/{board_id}"
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
            event, _created = NotificationEvent.objects.get_or_create(
                dedupe_key=dedupe_key,
                defaults={**defaults, "dedupe_key": dedupe_key},
            )
        except IntegrityError:
            # Extremely rare race: insert succeeded elsewhere between our
            # SELECT and INSERT. Fetch the existing event.
            event = NotificationEvent.objects.get(dedupe_key=dedupe_key)
    else:
        event = NotificationEvent.objects.create(**defaults, dedupe_key=None)

    # No enqueue step. The row itself is the queue entry: it was written in the
    # caller's transaction, and `dispatcher.process_outbox_events()` picks it up
    # on its next pass.
    #
    # The previous version called `transaction.on_commit(task.delay(event.pk))`.
    # That hand-off ran after the commit, so whenever the broker was
    # unreachable at that exact moment the event was lost while the database
    # already recorded the change that caused it. An outbox cannot lose it:
    # either the transaction committed and the row is there to be found, or it
    # rolled back and there was nothing to send.
    _notify_dispatcher()
    return event


def _notify_dispatcher() -> None:
    """Wake a listening dispatcher early instead of waiting for its next poll.

    This is not the Celery hand-off ADR 0002 rules out: `NOTIFY` in PostgreSQL
    is transactional — a listener only receives it once this transaction
    actually commits, and never if it rolls back. A signal that never arrives
    (no listener connected, connection dropped) loses nothing, because the
    `NotificationEvent` row is already the durable queue entry and the next
    poll picks it up regardless. This only shortens the wait; the outbox is
    still the only channel that carries the work itself.
    """

    if connection.vendor != "postgresql":
        return
    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT pg_notify(%s, '')", [NOTIFICATION_CHANNEL])
    except Exception:  # noqa: BLE001 - a missed wakeup must not lose the event
        logger.exception("notification_dispatcher_notify_failed")
