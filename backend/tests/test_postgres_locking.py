"""Locking behaviour that only PostgreSQL implements.

SQLite ignores `select_for_update()` entirely, so the queries the notification
queue and the recurrence job depend on are never really executed on the test
database: `FOR UPDATE` on the nullable side of an outer join and `SKIP LOCKED`
between two workers both look fine there and both broke in production.

These tests skip unless the suite runs against PostgreSQL — the CI job
`backend-postgres` provides it (`DJANGO_TEST_USE_ENV_DB=1`).
"""

from __future__ import annotations

import os
import threading
from datetime import timedelta

import pytest
from django.db import connection, transaction
from django.utils import timezone

from kanban import dispatcher
from kanban.models import (
    Card,
    NotificationEvent,
    NotificationEventType,
    RecurrenceFrequency,
    RecurrenceRule,
)
from kanban.notifications import create_notification_event
from kanban.tasks import generate_recurring_cards

requires_postgres = pytest.mark.skipif(
    connection.vendor != "postgresql",
    reason="проверяет семантику блокировок, которой нет в SQLite",
)


# ---------------------------------------------------------------------------
# The engine under test
# ---------------------------------------------------------------------------


@pytest.mark.django_db()
def test_the_suite_really_runs_on_postgresql_when_required() -> None:
    """Keep the `backend-postgres` job from degenerating into a second SQLite run.

    Everything below skips on SQLite, so losing `DJANGO_TEST_USE_ENV_DB` or the
    `postgres` service would leave the job green while testing nothing. The job
    sets `DJANGO_TEST_REQUIRE_POSTGRES=1`, and then this must hold.
    """

    if os.getenv("DJANGO_TEST_REQUIRE_POSTGRES", "").lower() not in {
        "1",
        "true",
        "yes",
        "on",
    }:
        pytest.skip("прогон без требования PostgreSQL")

    assert connection.vendor == "postgresql", (
        "ожидался PostgreSQL, а тесты идут на "
        f"{connection.vendor}: проверьте DJANGO_TEST_USE_ENV_DB и DATABASE_URL"
    )


# ---------------------------------------------------------------------------
# FOR UPDATE and outer joins
# ---------------------------------------------------------------------------


@requires_postgres
@pytest.mark.django_db()
def test_recurrence_generation_locks_a_rule_whose_card_has_no_assignee(
    card,
) -> None:
    """`card__assignee` is nullable, so `select_related` gives a LEFT JOIN."""

    now = timezone.now()
    card.completed_at = now
    card.save(update_fields=["completed_at"])
    assert card.assignee_id is None
    rule = RecurrenceRule.objects.create(
        card=card,
        freq=RecurrenceFrequency.DAILY,
        interval=1,
        next_due=now - timedelta(minutes=1),
    )

    generate_recurring_cards()

    assert Card.objects.filter(parent_recurrence=rule).count() == 1


@requires_postgres
@pytest.mark.django_db()
def test_event_dispatch_locks_an_event_without_actor_card_or_column(
    board,
) -> None:
    """`actor`, `column` and `card` are SET_NULL FKs — all outer joins."""

    event = create_notification_event(
        event_type=NotificationEventType.CARD_CREATED,
        actor=None,
        board=board,
        summary="Создана задача",
    )

    processed = dispatcher.process_outbox_events()

    assert processed == 1
    event.refresh_from_db()
    assert event.dispatch_status == NotificationEvent.Dispatch.DONE


# ---------------------------------------------------------------------------
# SKIP LOCKED between two workers
# ---------------------------------------------------------------------------


@requires_postgres
@pytest.mark.django_db(transaction=True)
def test_event_locked_by_another_worker_is_skipped_and_stays_pending(
    board, regular_user
) -> None:
    """Two dispatchers must not deliver the same event twice."""

    event = create_notification_event(
        event_type=NotificationEventType.CARD_CREATED,
        actor=regular_user,
        board=board,
        summary="Создана задача",
    )

    locked = threading.Event()
    release = threading.Event()

    def hold_the_row() -> None:
        try:
            with transaction.atomic():
                NotificationEvent.objects.select_for_update(of=("self",)).get(
                    id=event.id
                )
                locked.set()
                release.wait(timeout=10)
        finally:
            # A thread gets its own connection; the test database cannot be
            # torn down while it is open.
            connection.close()

    worker = threading.Thread(target=hold_the_row)
    worker.start()
    try:
        assert locked.wait(timeout=10), "поток не успел взять блокировку"
        processed = dispatcher.process_outbox_events()
    finally:
        release.set()
        worker.join(timeout=10)

    assert processed == 0
    event.refresh_from_db()
    assert event.dispatch_status == NotificationEvent.Dispatch.PENDING
