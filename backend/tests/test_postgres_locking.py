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
from django.contrib.auth import get_user_model
from django.db import connection, transaction
from django.utils import timezone

from kanban import dispatcher
from kanban.models import (
    Card,
    NotificationEvent,
    NotificationEventType,
    RecurrenceFrequency,
    RecurrenceRule,
    UserSession,
)
from kanban.notifications import create_notification_event
from kanban.push_delivery import deliverable_devices, send_push_to_user
from kanban.reminders import skip_reminders_for_completed_card
from kanban.tasks import generate_recurring_cards
from tests.auth_helpers import client_for, make_push_device, make_session

User = get_user_model()

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
def test_event_locked_by_another_worker_is_skipped_and_stays_pending(board, regular_user) -> None:
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
                NotificationEvent.objects.select_for_update(of=("self",)).get(id=event.id)
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


# ---------------------------------------------------------------------------
# Concurrent "complete" taps (AUDIT-026)
# ---------------------------------------------------------------------------


@requires_postgres
@pytest.mark.django_db(transaction=True)
def test_concurrent_complete_taps_only_one_wins(monkeypatch, column, regular_user) -> None:
    """Two simultaneous taps on `complete` must not both count as a transition.

    The first request is paused mid-transaction (row locked, not yet
    committed) via a hook that only fires on the real completion path, so the
    second request's `select_for_update` genuinely blocks on PostgreSQL and
    then observes the already-completed row instead of racing it.
    """

    first_actor = regular_user
    second_actor = User.objects.create_user(username="second-tapper", password="pass")
    card = Card.objects.create(column=column, title="Купить хлеб")

    locked = threading.Event()
    release = threading.Event()
    calls = 0

    def paused_skip(*, card_id: int) -> None:
        nonlocal calls
        calls += 1
        locked.set()
        release.wait(timeout=10)
        skip_reminders_for_completed_card(card_id=card_id)

    monkeypatch.setattr("kanban.views.cards.skip_reminders_for_completed_card", paused_skip)

    results: dict[str, object] = {}

    def call_first() -> None:
        try:
            client = client_for(first_actor)
            results["first"] = client.post(f"/api/v1/cards/{card.id}/complete/")
        finally:
            connection.close()

    worker = threading.Thread(target=call_first)
    worker.start()
    try:
        assert locked.wait(timeout=10), "поток не успел взять блокировку"
        client = client_for(second_actor)
        second_resp = client.post(f"/api/v1/cards/{card.id}/complete/")
    finally:
        release.set()
        worker.join(timeout=10)

    assert results["first"].status_code == 200
    assert second_resp.status_code == 200
    assert calls == 1, "второй запрос не должен доходить до реального перехода"
    card.refresh_from_db()
    assert card.completed_by_id == first_actor.id
    assert (
        NotificationEvent.objects.filter(event_type="card.completed", card_id=card.id).count() == 1
    )


# ---------------------------------------------------------------------------
# Device delivery selection: join to the session under FOR UPDATE
# ---------------------------------------------------------------------------


@requires_postgres
@pytest.mark.django_db()
def test_delivery_selection_joins_the_session_under_for_update(regular_user) -> None:
    """The session FK is NOT NULL, so the join is inner and FOR UPDATE is allowed.

    An outer join here (the shape a nullable FK would compile to) makes
    PostgreSQL reject the query, which SQLite never shows.
    """

    session = make_session(regular_user)
    device = make_push_device(
        regular_user, session=session, endpoint="https://push.example.com/live"
    )

    with transaction.atomic():
        selected = list(deliverable_devices(user_id=regular_user.pk))

    assert [item.pk for item in selected] == [device.pk]


@requires_postgres
@pytest.mark.django_db(transaction=True)
def test_delivery_selection_does_not_lock_the_session_row(regular_user) -> None:
    """`of=("self",)` keeps the daily cleanup's sessions lockable during a send."""

    session = make_session(regular_user)
    make_push_device(regular_user, session=session, endpoint="https://push.example.com/live")

    locked = threading.Event()
    release = threading.Event()
    acquired = False

    def hold_the_device_lock() -> None:
        try:
            with transaction.atomic():
                list(deliverable_devices(user_id=regular_user.pk))
                locked.set()
                release.wait(timeout=10)
        finally:
            connection.close()

    worker = threading.Thread(target=hold_the_device_lock)
    worker.start()
    try:
        assert locked.wait(timeout=10), "поток не успел взять блокировку"
        with transaction.atomic():
            # `nowait` turns "the session row is locked too" into an immediate
            # error instead of a wait that the finally block would release.
            UserSession.objects.select_for_update(nowait=True).get(pk=session.pk)
            acquired = True
    finally:
        release.set()
        worker.join(timeout=10)

    assert acquired, "выборка устройств не должна блокировать строку сессии"


@requires_postgres
@pytest.mark.django_db(transaction=True)
def test_delivery_retries_when_a_live_device_is_locked(regular_user) -> None:
    """A device hidden by `SKIP LOCKED` must retry, not silently go missing."""

    session = make_session(regular_user)
    make_push_device(regular_user, session=session, endpoint="https://push.example.com/live")

    locked = threading.Event()
    release = threading.Event()

    def hold_the_device_lock() -> None:
        try:
            with transaction.atomic():
                list(deliverable_devices(user_id=regular_user.pk))
                locked.set()
                release.wait(timeout=10)
        finally:
            connection.close()

    worker = threading.Thread(target=hold_the_device_lock)
    worker.start()
    try:
        assert locked.wait(timeout=10), "поток не успел взять блокировку"
        result = send_push_to_user(user_id=regular_user.pk, title="t", body="b")
    finally:
        release.set()
        worker.join(timeout=10)

    assert result.sent == 0
    assert result.failed == 1
    assert result.no_devices is False


@requires_postgres
@pytest.mark.django_db()
def test_recurrence_generation_skips_a_rearmed_rule_that_has_a_successor(card) -> None:
    """The successor check runs under the rule's `FOR UPDATE` lock."""

    now = timezone.now()
    card.completed_at = now
    card.save(update_fields=["completed_at"])
    rule = RecurrenceRule.objects.create(
        card=card,
        freq=RecurrenceFrequency.DAILY,
        interval=1,
        next_due=now - timedelta(minutes=1),
    )
    Card.objects.create(column=card.column, title=card.title, parent_recurrence=rule)

    generate_recurring_cards()

    assert Card.objects.filter(parent_recurrence=rule).count() == 1
    rule.refresh_from_db()
    assert rule.next_due is None
