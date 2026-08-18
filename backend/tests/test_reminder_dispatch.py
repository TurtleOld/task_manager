from __future__ import annotations

from datetime import timedelta
from typing import Any

import pytest
from django.conf import settings
from django.utils import timezone

from kanban import tasks as tasks_module
from kanban.models import Card, CardDeadlineReminder, NotificationProfile
from kanban.reminders import upsert_and_schedule_reminder
from kanban.tasks import dispatch_due_reminders


@pytest.fixture()
def _capture_dispatch(monkeypatch: pytest.MonkeyPatch) -> list[tuple[Any, ...]]:
    """Record what dispatch_due_reminders would enqueue."""
    calls: list[tuple[Any, ...]] = []

    class _Stub:
        def delay(self, *args: object) -> None:
            calls.append(args)

    monkeypatch.setattr(tasks_module, "send_card_deadline_reminder", _Stub())
    return calls


def _make_reminder(*, column, user, scheduled_at, deadline) -> CardDeadlineReminder:
    card = Card.objects.create(
        column=column,
        title="Reminder card",
        deadline=deadline,
    )
    return CardDeadlineReminder.objects.create(
        card=card,
        user=user,
        enabled=True,
        status=CardDeadlineReminder.Status.SCHEDULED,
        scheduled_at=scheduled_at,
        schedule_token="11111111-1111-1111-1111-111111111111",
        channel="push",
    )


@pytest.mark.django_db()
def test_dispatch_runs_every_minute() -> None:
    assert settings.CELERY_BEAT_SCHEDULE["dispatch-due-reminders"]["schedule"] == 60.0


@pytest.mark.django_db()
def test_scheduling_does_not_use_broker_eta(
    column, regular_user, monkeypatch: pytest.MonkeyPatch
) -> None:
    """The regression this whole change is about: no ETA message is created."""
    called: list[object] = []

    class _Stub:
        def apply_async(self, *a: object, **kw: object) -> None:
            called.append(kw)

        def delay(self, *a: object) -> None:
            called.append(a)

    monkeypatch.setattr(tasks_module, "send_card_deadline_reminder", _Stub())

    now = timezone.now()
    NotificationProfile.objects.update_or_create(user=regular_user, defaults={"fcm_token": "token"})
    card = Card.objects.create(
        column=column,
        title="Far future",
        deadline=now + timedelta(days=30),
    )
    reminder = CardDeadlineReminder.objects.create(
        card=card,
        user=regular_user,
        enabled=True,
        channel="push",
        offset_value=20,
    )

    upsert_and_schedule_reminder(card=card, reminder=reminder)

    reminder.refresh_from_db()
    assert reminder.status == CardDeadlineReminder.Status.SCHEDULED
    assert reminder.scheduled_at is not None
    # Nothing was handed to the broker: the DB row is the only state.
    assert called == []


@pytest.mark.django_db()
def test_due_reminder_is_dispatched(
    column,
    regular_user,
    _capture_dispatch: list[tuple[Any, ...]],
    django_capture_on_commit_callbacks,
) -> None:
    now = timezone.now()
    reminder = _make_reminder(
        column=column,
        user=regular_user,
        scheduled_at=now - timedelta(minutes=1),
        deadline=now + timedelta(minutes=19),
    )

    with django_capture_on_commit_callbacks(execute=True):
        dispatch_due_reminders()

    reminder.refresh_from_db()
    assert reminder.status == CardDeadlineReminder.Status.DISPATCHED
    assert len(_capture_dispatch) == 1
    assert _capture_dispatch[0][0] == reminder.id


@pytest.mark.django_db()
def test_future_reminder_is_left_alone(
    column, regular_user, _capture_dispatch: list[tuple[Any, ...]]
) -> None:
    now = timezone.now()
    reminder = _make_reminder(
        column=column,
        user=regular_user,
        scheduled_at=now + timedelta(days=30),
        deadline=now + timedelta(days=30, minutes=20),
    )

    dispatch_due_reminders()

    reminder.refresh_from_db()
    assert reminder.status == CardDeadlineReminder.Status.SCHEDULED
    assert _capture_dispatch == []


@pytest.mark.django_db()
def test_reminder_lost_during_downtime_is_caught_up(
    column,
    regular_user,
    _capture_dispatch: list[tuple[Any, ...]],
    django_capture_on_commit_callbacks,
) -> None:
    """A reminder whose moment passed while the worker was down still fires."""
    now = timezone.now()
    reminder = _make_reminder(
        column=column,
        user=regular_user,
        scheduled_at=now - timedelta(minutes=30),
        deadline=now - timedelta(minutes=10),
    )

    with django_capture_on_commit_callbacks(execute=True):
        dispatch_due_reminders()

    reminder.refresh_from_db()
    assert reminder.status == CardDeadlineReminder.Status.DISPATCHED
    assert len(_capture_dispatch) == 1


@pytest.mark.django_db()
def test_stale_reminder_is_skipped_not_sent(
    column, regular_user, _capture_dispatch: list[tuple[Any, ...]]
) -> None:
    """After a long outage, obsolete reminders must not flood the user."""
    now = timezone.now()
    reminder = _make_reminder(
        column=column,
        user=regular_user,
        scheduled_at=now - timedelta(days=3),
        deadline=now - timedelta(days=3),
    )

    dispatch_due_reminders()

    reminder.refresh_from_db()
    assert reminder.status == CardDeadlineReminder.Status.SKIPPED
    assert _capture_dispatch == []


@pytest.mark.django_db()
def test_dispatch_is_not_repeated_on_next_tick(
    column,
    regular_user,
    _capture_dispatch: list[tuple[Any, ...]],
    django_capture_on_commit_callbacks,
) -> None:
    now = timezone.now()
    _make_reminder(
        column=column,
        user=regular_user,
        scheduled_at=now - timedelta(minutes=1),
        deadline=now + timedelta(minutes=19),
    )

    with django_capture_on_commit_callbacks(execute=True):
        dispatch_due_reminders()
    with django_capture_on_commit_callbacks(execute=True):
        dispatch_due_reminders()

    assert len(_capture_dispatch) == 1


@pytest.mark.django_db()
def test_stuck_dispatch_is_recovered(
    column,
    regular_user,
    _capture_dispatch: list[tuple[Any, ...]],
    django_capture_on_commit_callbacks,
) -> None:
    """A worker that died mid-flight leaves DISPATCHED; it must be retried."""
    now = timezone.now()
    reminder = _make_reminder(
        column=column,
        user=regular_user,
        scheduled_at=now - timedelta(minutes=5),
        deadline=now + timedelta(minutes=15),
    )
    CardDeadlineReminder.objects.filter(id=reminder.id).update(
        status=CardDeadlineReminder.Status.DISPATCHED,
        updated_at=now - timedelta(hours=1),
    )

    with django_capture_on_commit_callbacks(execute=True):
        dispatch_due_reminders()

    reminder.refresh_from_db()
    assert reminder.status == CardDeadlineReminder.Status.DISPATCHED
    assert len(_capture_dispatch) == 1


@pytest.mark.django_db()
def test_disabled_reminder_is_not_dispatched(
    column, regular_user, _capture_dispatch: list[tuple[Any, ...]]
) -> None:
    now = timezone.now()
    reminder = _make_reminder(
        column=column,
        user=regular_user,
        scheduled_at=now - timedelta(minutes=1),
        deadline=now + timedelta(minutes=19),
    )
    CardDeadlineReminder.objects.filter(id=reminder.id).update(enabled=False)

    dispatch_due_reminders()

    reminder.refresh_from_db()
    assert reminder.status == CardDeadlineReminder.Status.SCHEDULED
    assert _capture_dispatch == []


@pytest.mark.django_db()
def test_delivery_tasks_are_isolated_from_housekeeping() -> None:
    """User-facing sends must not share a queue with long sweeps."""
    routes = settings.CELERY_TASK_ROUTES

    for task in (
        "kanban.tasks.send_card_deadline_reminder",
        "kanban.tasks.send_notification_event",
        "kanban.tasks.send_overdue_card_reminders",
        "kanban.tasks.dispatch_due_reminders",
    ):
        assert routes[task]["queue"] == "notifications"

    for task in (
        "kanban.tasks.generate_recurring_cards",
        "kanban.tasks.prune_card_activity",
    ):
        assert routes[task]["queue"] == "maintenance"
