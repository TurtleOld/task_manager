from __future__ import annotations

import logging
from datetime import timedelta
from typing import Any, cast

from django.conf import settings
from django.contrib.auth import get_user_model
from django.contrib.auth.models import AbstractUser
from django.db import connection
from django.db.utils import IntegrityError
from django.utils import timezone

from .models import Board, Card, Column, NotificationEvent, NotificationEventType

User = get_user_model()

logger = logging.getLogger(__name__)

# Shared with `run_dispatcher`'s `LISTEN`. Not env-configurable — a channel
# name is an implementation detail, not deployment configuration.
NOTIFICATION_CHANNEL = "kanban_events"

# `dedupe_key` prefix for a coalescing `card.updated` window, keyed by
# `(card_id, actor_id)`. `process_outbox_events` clears the key once such an
# event is actually dispatched, so the next edit starts a fresh window
# instead of reusing the one already sent.
PENDING_CARD_UPDATE_DEDUPE_PREFIX = "card.updated.pending:"

# How long a coalescing window stays open after the last edit before the
# dispatcher picks it up on its own, absent an explicit flush.
PENDING_CARD_UPDATE_WINDOW = timedelta(minutes=5)


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


def _pending_card_update_dedupe_key(*, card_id: int, actor: AbstractUser | None) -> str:
    actor_id = getattr(actor, "id", None)
    actor_part = actor_id if actor_id is not None else "none"
    return f"{PENDING_CARD_UPDATE_DEDUPE_PREFIX}{card_id}:{actor_part}"


def is_pending_card_update_window(event: NotificationEvent) -> bool:
    """Whether `event` is a still-open `card.updated` coalescing window."""

    return bool(event.dedupe_key) and event.dedupe_key.startswith(
        PENDING_CARD_UPDATE_DEDUPE_PREFIX
    )


def create_or_extend_pending_card_update_event(
    *, card: Card, actor: AbstractUser | None
) -> NotificationEvent:
    """Record that `card` changed, coalescing edits by the same actor.

    Every server-side edit of a card calls this instead of creating its own
    `card.updated` event. A row for `(card_id, actor_id)` is created on the
    first edit and its `next_attempt_at` is pushed forward on every
    subsequent one, so one editing session becomes one event rather than one
    per field. `notify_updated` (empty-body flush) or, failing that, the
    window elapsing is what makes the dispatcher actually pick the row up.
    """

    dedupe_key = _pending_card_update_dedupe_key(card_id=card.id, actor=actor)
    ready_at = timezone.now() + PENDING_CARD_UPDATE_WINDOW
    defaults = {
        "event_type": NotificationEventType.CARD_UPDATED,
        "actor": actor,
        "board": card.board,
        "card": card,
        "summary": f"В «{card.title}» сделаны изменения",
        "link": build_frontend_link(card.board_id),
        "payload": {},
        "dedupe_key": dedupe_key,
        "next_attempt_at": ready_at,
    }
    try:
        event, created = NotificationEvent.objects.get_or_create(
            dedupe_key=dedupe_key, defaults=defaults
        )
    except IntegrityError:
        event = NotificationEvent.objects.get(dedupe_key=dedupe_key)
        created = False

    if not created:
        event.summary = defaults["summary"]
        event.next_attempt_at = ready_at
        event.save(update_fields=["summary", "next_attempt_at"])

    return event


def flush_pending_card_update_event(*, card: Card, actor: AbstractUser | None) -> None:
    """Make an open `card.updated` window for `(card, actor)` due right now.

    A no-op when there is no open window — closing the task screen without
    having changed anything is not an error.
    """

    dedupe_key = _pending_card_update_dedupe_key(card_id=card.id, actor=actor)
    updated = NotificationEvent.objects.filter(
        dedupe_key=dedupe_key,
        dispatch_status=NotificationEvent.Dispatch.PENDING,
    ).update(next_attempt_at=timezone.now())
    if updated:
        _notify_dispatcher()


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
