"""Tests for the database-backed notification dispatcher.

These cover the properties that the Celery pipeline could not guarantee: an
event survives a broker that does not exist, one broken device does not silence
the others, and a crash mid-send is recovered rather than lost.
"""

from __future__ import annotations

from datetime import timedelta

import pytest
from django.contrib.auth import get_user_model
from django.utils import timezone

from kanban import dispatcher
from kanban.models import (
    Card,
    CardDeadlineReminder,
    DispatcherHeartbeat,
    NotificationEvent,
    NotificationEventType,
    NotificationInboxEntry,
    NotificationProfile,
    PushDevice,
)
from kanban.notifications import create_notification_event
from kanban.push_delivery import send_push_to_user
from kanban.webpush import PushDeliveryError, PushSubscriptionGoneError

User = get_user_model()


def _device(user, endpoint: str = "https://push.example.com/a") -> PushDevice:
    return PushDevice.objects.create(
        user=user,
        kind=PushDevice.Kind.WEBPUSH,
        endpoint=endpoint,
        p256dh="p256dh-key",
        auth="auth-key",
    )


# ---------------------------------------------------------------------------
# Outbox
# ---------------------------------------------------------------------------


@pytest.mark.django_db()
def test_event_is_pending_without_any_broker(board, regular_user) -> None:
    """Creating an event must not depend on a queue being reachable."""

    event = create_notification_event(
        event_type=NotificationEventType.CARD_CREATED,
        actor=regular_user,
        board=board,
        summary="Создана задача",
    )

    event.refresh_from_db()
    assert event.dispatch_status == NotificationEvent.Dispatch.PENDING
    assert event.dispatch_attempts == 0


@pytest.mark.django_db()
def test_tick_delivers_pending_event_and_marks_it_done(board, regular_user) -> None:
    event = create_notification_event(
        event_type=NotificationEventType.CARD_CREATED,
        actor=regular_user,
        board=board,
        summary="Создана задача",
    )

    dispatcher.tick()

    event.refresh_from_db()
    assert event.dispatch_status == NotificationEvent.Dispatch.DONE


@pytest.mark.django_db()
def test_delivered_event_is_not_delivered_twice(board, regular_user) -> None:
    create_notification_event(
        event_type=NotificationEventType.CARD_CREATED,
        actor=regular_user,
        board=board,
        summary="Создана задача",
    )

    first = dispatcher.tick()
    second = dispatcher.tick()

    assert first["events"] == 1
    assert second["events"] == 0


@pytest.mark.django_db()
def test_inbox_entry_is_written_even_when_push_fails(
    board, regular_user, webpush_settings, monkeypatch
) -> None:
    """The in-app inbox touches nothing external and must never depend on push."""

    _device(regular_user)

    def explode(**_kwargs):
        raise PushDeliveryError("push service unavailable")

    monkeypatch.setattr("kanban.push_delivery.send_webpush", explode, raising=False)
    monkeypatch.setattr("kanban.webpush.send_webpush", explode)

    event = create_notification_event(
        event_type=NotificationEventType.CARD_CREATED,
        actor=regular_user,
        board=board,
        summary="Создана задача",
    )

    dispatcher.tick()

    assert NotificationInboxEntry.objects.filter(event=event).exists()


@pytest.mark.django_db()
def test_failed_event_backs_off_then_gives_up(board, regular_user, monkeypatch) -> None:
    monkeypatch.setattr(
        dispatcher,
        "_event_recipients",
        lambda _event: (_ for _ in ()).throw(RuntimeError("recipients blew up")),
    )

    event = create_notification_event(
        event_type=NotificationEventType.CARD_CREATED,
        actor=regular_user,
        board=board,
        summary="Создана задача",
    )

    now = timezone.now()
    for attempt in range(1, 6):
        # Jump past the backoff each round instead of sleeping.
        NotificationEvent.objects.filter(id=event.id).update(next_attempt_at=now)
        dispatcher.process_outbox_events(now=now)
        event.refresh_from_db()
        assert event.dispatch_attempts == attempt

    assert event.dispatch_status == NotificationEvent.Dispatch.FAILED
    assert "recipients blew up" in event.dispatch_error


@pytest.mark.django_db()
def test_stuck_processing_event_is_recovered(board, regular_user, settings) -> None:
    """A dispatcher killed mid-send leaves PROCESSING behind; the next pass retries."""

    event = create_notification_event(
        event_type=NotificationEventType.CARD_CREATED,
        actor=regular_user,
        board=board,
        summary="Создана задача",
    )
    stale = timezone.now() - timedelta(minutes=settings.DISPATCHER_STUCK_MINUTES + 1)
    NotificationEvent.objects.filter(id=event.id).update(
        dispatch_status=NotificationEvent.Dispatch.PROCESSING,
        dispatch_started_at=stale,
    )

    recovered = dispatcher.recover_stuck()

    event.refresh_from_db()
    assert recovered == 1
    assert event.dispatch_status == NotificationEvent.Dispatch.PENDING


# ---------------------------------------------------------------------------
# Multi-device fan-out
# ---------------------------------------------------------------------------


@pytest.mark.django_db()
def test_second_device_does_not_replace_the_first(regular_user) -> None:
    _device(regular_user, "https://push.example.com/phone")
    _device(regular_user, "https://push.example.com/laptop")

    assert PushDevice.objects.filter(user=regular_user, active=True).count() == 2


@pytest.mark.django_db()
def test_one_broken_device_does_not_silence_the_others(
    regular_user, webpush_settings, monkeypatch
) -> None:
    _device(regular_user, "https://push.example.com/broken")
    _device(regular_user, "https://push.example.com/working")

    def selective(*, endpoint: str, **_kwargs):
        if "broken" in endpoint:
            raise PushDeliveryError("boom")

    monkeypatch.setattr("kanban.webpush.send_webpush", selective)

    result = send_push_to_user(user_id=regular_user.pk, title="t", body="b")

    assert result.delivered is True
    assert result.sent == 1
    assert result.failed == 1


@pytest.mark.django_db()
def test_gone_subscription_retires_only_that_device(
    regular_user, webpush_settings, monkeypatch
) -> None:
    gone = _device(regular_user, "https://push.example.com/gone")
    alive = _device(regular_user, "https://push.example.com/alive")

    def selective(*, endpoint: str, **_kwargs):
        if "gone" in endpoint:
            raise PushSubscriptionGoneError("Subscription gone: HTTP 410")

    monkeypatch.setattr("kanban.webpush.send_webpush", selective)

    result = send_push_to_user(user_id=regular_user.pk, title="t", body="b")

    gone.refresh_from_db()
    alive.refresh_from_db()
    assert result.retired == 1
    assert gone.active is False
    assert alive.active is True


@pytest.mark.django_db()
def test_transient_failure_keeps_the_device(regular_user, webpush_settings, monkeypatch) -> None:
    """A network blip must never cost someone their subscription."""

    device = _device(regular_user)

    def explode(**_kwargs):
        raise PushDeliveryError("connection reset")

    monkeypatch.setattr("kanban.webpush.send_webpush", explode)

    send_push_to_user(user_id=regular_user.pk, title="t", body="b")

    device.refresh_from_db()
    assert device.active is True
    assert device.failure_count == 1


@pytest.mark.django_db()
def test_success_resets_the_failure_counter(regular_user, webpush_settings, monkeypatch) -> None:
    device = _device(regular_user)
    device.failure_count = 4
    device.last_error = "старая ошибка"
    device.save()

    monkeypatch.setattr("kanban.webpush.send_webpush", lambda **_kwargs: None)

    send_push_to_user(user_id=regular_user.pk, title="t", body="b")

    device.refresh_from_db()
    assert device.failure_count == 0
    assert device.last_error == ""


# ---------------------------------------------------------------------------
# Deadline reminders
# ---------------------------------------------------------------------------


@pytest.mark.django_db()
def test_due_reminder_is_delivered(column, regular_user, webpush_settings, monkeypatch) -> None:
    sent: list[str] = []
    monkeypatch.setattr(
        "kanban.webpush.send_webpush",
        lambda *, endpoint, **_kwargs: sent.append(endpoint),
    )
    _device(regular_user)
    NotificationProfile.objects.get_or_create(user=regular_user)

    now = timezone.now()
    card = Card.objects.create(
        column=column, title="Полить цветы", deadline=now + timedelta(hours=1)
    )
    reminder = CardDeadlineReminder.objects.create(
        card=card,
        user=regular_user,
        enabled=True,
        offset_value=20,
        status=CardDeadlineReminder.Status.SCHEDULED,
        scheduled_at=now - timedelta(seconds=30),
        schedule_token="11111111-1111-1111-1111-111111111111",
    )

    delivered = dispatcher.process_due_reminders(now=now)

    reminder.refresh_from_db()
    assert delivered == 1
    assert len(sent) == 1
    assert reminder.status == CardDeadlineReminder.Status.SENT


@pytest.mark.django_db()
def test_long_overdue_reminder_is_skipped_not_sent(
    column, regular_user, webpush_settings, monkeypatch
) -> None:
    """Waking someone at night about Tuesday's deadline is worse than silence."""

    sent: list[str] = []
    monkeypatch.setattr(
        "kanban.webpush.send_webpush",
        lambda *, endpoint, **_kwargs: sent.append(endpoint),
    )
    _device(regular_user)

    now = timezone.now()
    card = Card.objects.create(column=column, title="Старое", deadline=now)
    reminder = CardDeadlineReminder.objects.create(
        card=card,
        user=regular_user,
        enabled=True,
        offset_value=20,
        status=CardDeadlineReminder.Status.SCHEDULED,
        scheduled_at=now - timedelta(minutes=dispatcher.REMINDER_STALE_MINUTES + 10),
        schedule_token="22222222-2222-2222-2222-222222222222",
    )

    dispatcher.process_due_reminders(now=now)

    reminder.refresh_from_db()
    assert sent == []
    assert reminder.status == CardDeadlineReminder.Status.SKIPPED


@pytest.mark.django_db()
def test_reminder_retry_is_scheduled_after_a_failure(
    column, regular_user, webpush_settings, monkeypatch
) -> None:
    def explode(**_kwargs):
        raise PushDeliveryError("push service down")

    monkeypatch.setattr("kanban.webpush.send_webpush", explode)
    _device(regular_user)

    now = timezone.now()
    card = Card.objects.create(column=column, title="Задача", deadline=now + timedelta(hours=1))
    reminder = CardDeadlineReminder.objects.create(
        card=card,
        user=regular_user,
        enabled=True,
        offset_value=20,
        status=CardDeadlineReminder.Status.SCHEDULED,
        scheduled_at=now - timedelta(seconds=30),
        schedule_token="33333333-3333-3333-3333-333333333333",
    )

    dispatcher.process_due_reminders(now=now)

    reminder.refresh_from_db()
    # Still SCHEDULED so a later pass retries, with the next attempt deferred.
    assert reminder.status == CardDeadlineReminder.Status.SCHEDULED
    assert reminder.attempts == 1
    assert reminder.next_attempt_at is not None
    assert reminder.next_attempt_at > now


# ---------------------------------------------------------------------------
# Heartbeat
# ---------------------------------------------------------------------------


@pytest.mark.django_db()
def test_tick_records_a_heartbeat() -> None:
    dispatcher.tick()

    heartbeat = DispatcherHeartbeat.objects.get(name="dispatcher")
    assert heartbeat.last_tick_at is not None
    assert heartbeat.ticks == 1


@pytest.mark.django_db()
def test_tick_survives_a_failing_pass(monkeypatch) -> None:
    """A bad tick must record the error, not kill the loop."""

    monkeypatch.setattr(
        dispatcher,
        "process_due_reminders",
        lambda **_kwargs: (_ for _ in ()).throw(RuntimeError("db went away")),
    )

    dispatcher.tick()

    heartbeat = DispatcherHeartbeat.objects.get(name="dispatcher")
    assert "db went away" in heartbeat.last_error


# ---------------------------------------------------------------------------
# Maintenance (what the Celery beat schedule used to own)
# ---------------------------------------------------------------------------


@pytest.mark.django_db()
def test_maintenance_runs_the_periodic_jobs(monkeypatch) -> None:
    """These three were the last reason for a beat container to exist."""

    called: list[str] = []
    for name in ("generate_recurring_cards", "send_overdue_card_reminders", "prune_card_activity"):
        monkeypatch.setattr(
            f"kanban.tasks.{name}.apply",
            (lambda n: lambda **_kw: called.append(n))(name),
        )

    dispatcher.maintenance_tick()

    assert called == [
        "generate_recurring_cards",
        "send_overdue_card_reminders",
        "prune_card_activity",
    ]


@pytest.mark.django_db()
def test_prune_is_throttled_to_once_a_day(monkeypatch) -> None:
    """Pruning is a monthly-scale chore; the 5-minute cadence must not run it."""

    pruned: list[int] = []
    monkeypatch.setattr("kanban.tasks.generate_recurring_cards.apply", lambda **_kw: None)
    monkeypatch.setattr("kanban.tasks.send_overdue_card_reminders.apply", lambda **_kw: None)
    monkeypatch.setattr("kanban.tasks.prune_card_activity.apply", lambda **_kw: pruned.append(1))

    dispatcher.maintenance_tick()
    dispatcher.maintenance_tick()

    assert len(pruned) == 1

    # Once the interval has elapsed it runs again.
    DispatcherHeartbeat.objects.update(
        last_prune_at=timezone.now() - timedelta(hours=dispatcher.PRUNE_INTERVAL_HOURS + 1)
    )
    dispatcher.maintenance_tick()

    assert len(pruned) == 2


@pytest.mark.django_db()
def test_one_failing_chore_does_not_skip_the_others(monkeypatch) -> None:
    pruned: list[int] = []
    monkeypatch.setattr(
        "kanban.tasks.generate_recurring_cards.apply",
        lambda **_kw: (_ for _ in ()).throw(RuntimeError("recurrence exploded")),
    )
    monkeypatch.setattr("kanban.tasks.send_overdue_card_reminders.apply", lambda **_kw: None)
    monkeypatch.setattr("kanban.tasks.prune_card_activity.apply", lambda **_kw: pruned.append(1))

    dispatcher.maintenance_tick()

    assert pruned == [1]


# ---------------------------------------------------------------------------
# Event recipients (narrowing): everyone is notified on their device except the
# actor, while the in-app inbox is written for everyone including the actor.
# ---------------------------------------------------------------------------


@pytest.mark.django_db()
def test_event_reaches_other_persons_device_but_not_actors(
    board, regular_user, webpush_settings, monkeypatch
) -> None:
    other = User.objects.create_user(username="user2", password="pw")
    actor_device = _device(regular_user, "https://push.example.com/actor")
    other_device = _device(other, "https://push.example.com/other")

    sent: list[str] = []
    monkeypatch.setattr(
        "kanban.webpush.send_webpush",
        lambda *, endpoint, **_kwargs: sent.append(endpoint),
    )

    create_notification_event(
        event_type=NotificationEventType.CARD_CREATED,
        actor=regular_user,
        board=board,
        summary="Создана задача",
    )

    dispatcher.process_outbox_events()

    assert actor_device.endpoint not in sent
    assert other_device.endpoint in sent


@pytest.mark.django_db()
def test_event_writes_inbox_for_actor_and_everyone_else(
    board, regular_user, webpush_settings, monkeypatch
) -> None:
    other = User.objects.create_user(username="user2", password="pw")
    _device(regular_user, "https://push.example.com/actor")
    _device(other, "https://push.example.com/other")
    monkeypatch.setattr("kanban.webpush.send_webpush", lambda **_kwargs: None)

    event = create_notification_event(
        event_type=NotificationEventType.CARD_CREATED,
        actor=regular_user,
        board=board,
        summary="Создана задача",
    )

    dispatcher.process_outbox_events()

    recipients = set(
        NotificationInboxEntry.objects.filter(event=event).values_list("user_id", flat=True)
    )
    assert recipients == {regular_user.id, other.id}


@pytest.mark.django_db()
def test_event_inbox_survives_total_delivery_failure(
    board, regular_user, webpush_settings, monkeypatch
) -> None:
    other = User.objects.create_user(username="user2", password="pw")
    _device(other)

    def explode(**_kwargs):
        raise PushDeliveryError("push service unavailable")

    monkeypatch.setattr("kanban.webpush.send_webpush", explode)

    event = create_notification_event(
        event_type=NotificationEventType.CARD_CREATED,
        actor=regular_user,
        board=board,
        summary="Создана задача",
    )

    dispatcher.process_outbox_events()

    # The actor always gets an inbox entry, and so does the recipient whose
    # device delivery failed — the inbox must not depend on the push service.
    recipients = set(
        NotificationInboxEntry.objects.filter(event=event).values_list("user_id", flat=True)
    )
    assert recipients == {regular_user.id, other.id}


@pytest.mark.django_db()
def test_reminder_is_delivered_only_to_its_owner(
    column, regular_user, webpush_settings, monkeypatch
) -> None:
    other = User.objects.create_user(username="user2", password="pw")
    owner_device = _device(regular_user, "https://push.example.com/owner")
    _device(other, "https://push.example.com/other")

    sent: list[str] = []
    monkeypatch.setattr(
        "kanban.webpush.send_webpush",
        lambda *, endpoint, **_kwargs: sent.append(endpoint),
    )
    NotificationProfile.objects.get_or_create(user=regular_user)

    now = timezone.now()
    card = Card.objects.create(
        column=column, title="Личное напоминание", deadline=now + timedelta(hours=1)
    )
    CardDeadlineReminder.objects.create(
        card=card,
        user=regular_user,
        enabled=True,
        offset_value=20,
        status=CardDeadlineReminder.Status.SCHEDULED,
        scheduled_at=now - timedelta(seconds=30),
        schedule_token="44444444-4444-4444-4444-444444444444",
    )

    dispatcher.process_due_reminders(now=now)

    assert sent == [owner_device.endpoint]
