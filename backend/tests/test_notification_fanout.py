from __future__ import annotations

import pytest
from django.contrib.auth import get_user_model

from kanban import dispatcher
from kanban.models import (
    NotificationChannel,
    NotificationDelivery,
    NotificationInboxEntry,
    NotificationPreference,
    PushDevice,
)
from kanban.notifications import create_notification_event

User = get_user_model()


def _device(user) -> PushDevice:
    return PushDevice.objects.create(
        user=user,
        kind=PushDevice.Kind.WEBPUSH,
        endpoint=f"https://push.example.com/{user.id}",
        p256dh="p256dh-key",
        auth="auth-key",
    )


def _event(actor, board):
    return create_notification_event(
        event_type="board.updated",
        actor=actor,
        board=board,
        summary="Обновлён список",
        payload={"board": board.name},
    )


@pytest.mark.django_db()
def test_inbox_written_for_every_recipient_including_actor(regular_user, board) -> None:
    other = User.objects.create_user(username="user2", password="pw")
    event = _event(regular_user, board)

    dispatcher.process_outbox_events()

    recipients = set(
        NotificationInboxEntry.objects.filter(event=event).values_list("user_id", flat=True)
    )
    assert recipients == {regular_user.id, other.id}


@pytest.mark.django_db()
def test_inbox_is_idempotent(regular_user, board) -> None:
    """A retry of the outbox pass must not duplicate inbox entries."""
    event = _event(regular_user, board)

    dispatcher.process_outbox_events()
    dispatcher.process_outbox_events()

    assert NotificationInboxEntry.objects.filter(event=event).count() == 1


@pytest.mark.django_db()
def test_mentions_limit_recipients(regular_user, board) -> None:
    mentioned = User.objects.create_user(username="user2", password="pw")
    event = create_notification_event(
        event_type="board.updated",
        actor=regular_user,
        board=board,
        summary="Упоминание",
        payload={"mention_user_ids": [mentioned.id]},
    )

    dispatcher.process_outbox_events()

    recipients = set(
        NotificationInboxEntry.objects.filter(event=event).values_list("user_id", flat=True)
    )
    assert recipients == {mentioned.id}


@pytest.mark.django_db()
def test_delivery_records_push_when_enabled(
    regular_user, board, webpush_settings, monkeypatch
) -> None:
    other = User.objects.create_user(username="user2", password="pw")
    _device(other)
    monkeypatch.setattr("kanban.webpush.send_webpush", lambda **_kwargs: None)
    event = _event(regular_user, board)

    dispatcher.process_outbox_events()

    delivery = NotificationDelivery.objects.get(
        event=event, user=other, channel=NotificationChannel.PUSH
    )
    assert delivery.status == NotificationDelivery.Status.SENT


@pytest.mark.django_db()
def test_delivery_is_idempotent_on_event_retry(
    regular_user, board, webpush_settings, monkeypatch
) -> None:
    """A retried event (e.g. after recover_stuck) must not push twice."""
    from kanban.models import NotificationEvent

    other = User.objects.create_user(username="user2", password="pw")
    _device(other)
    send_calls = []
    monkeypatch.setattr(
        "kanban.webpush.send_webpush", lambda **kwargs: send_calls.append(kwargs)
    )
    event = _event(regular_user, board)

    dispatcher.process_outbox_events()

    # Simulate the whole event being handed back for another pass, as
    # `recover_stuck()` does after a crashed dispatcher.
    NotificationEvent.objects.filter(id=event.id).update(
        dispatch_status=NotificationEvent.Dispatch.PENDING
    )
    dispatcher.process_outbox_events()

    assert len(send_calls) == 1
    assert (
        NotificationDelivery.objects.filter(
            event=event, user=other, channel=NotificationChannel.PUSH
        ).count()
        == 1
    )


@pytest.mark.django_db()
def test_failed_delivery_is_retried_on_event_retry(
    regular_user, board, webpush_settings, monkeypatch
) -> None:
    """Dedupe must not block a retry after a failed send."""
    from kanban.models import NotificationEvent

    other = User.objects.create_user(username="user2", password="pw")
    _device(other)

    def _fail(**_kwargs):
        raise RuntimeError("boom")

    monkeypatch.setattr("kanban.webpush.send_webpush", _fail)
    event = _event(regular_user, board)

    dispatcher.process_outbox_events()

    delivery = NotificationDelivery.objects.get(
        event=event, user=other, channel=NotificationChannel.PUSH
    )
    assert delivery.status == NotificationDelivery.Status.FAILED

    monkeypatch.setattr("kanban.webpush.send_webpush", lambda **_kwargs: None)
    NotificationEvent.objects.filter(id=event.id).update(
        dispatch_status=NotificationEvent.Dispatch.PENDING
    )
    dispatcher.process_outbox_events()

    delivery.refresh_from_db()
    assert delivery.status == NotificationDelivery.Status.SENT
    assert (
        NotificationDelivery.objects.filter(
            event=event, user=other, channel=NotificationChannel.PUSH
        ).count()
        == 1
    )


@pytest.mark.django_db()
def test_board_preference_overrides_global(
    regular_user, board, webpush_settings, monkeypatch
) -> None:
    """Board-scoped preference wins over the global one (regression guard)."""
    other = User.objects.create_user(username="user2", password="pw")
    _device(other)
    NotificationPreference.objects.create(
        user=other,
        board=None,
        channel=NotificationChannel.PUSH,
        event_type="board.updated",
        enabled=True,
    )
    NotificationPreference.objects.create(
        user=other,
        board=board,
        channel=NotificationChannel.PUSH,
        event_type="board.updated",
        enabled=False,
    )
    monkeypatch.setattr("kanban.webpush.send_webpush", lambda **_kwargs: None)
    event = _event(regular_user, board)

    dispatcher.process_outbox_events()

    assert not NotificationDelivery.objects.filter(
        event=event, user=other, channel=NotificationChannel.PUSH
    ).exists()


@pytest.mark.django_db()
def test_global_preference_applies_without_board_override(
    regular_user, board, webpush_settings, monkeypatch
) -> None:
    other = User.objects.create_user(username="user2", password="pw")
    _device(other)
    NotificationPreference.objects.create(
        user=other,
        board=None,
        channel=NotificationChannel.PUSH,
        event_type="board.updated",
        enabled=False,
    )
    monkeypatch.setattr("kanban.webpush.send_webpush", lambda **_kwargs: None)
    event = _event(regular_user, board)

    dispatcher.process_outbox_events()

    assert not NotificationDelivery.objects.filter(
        event=event, user=other, channel=NotificationChannel.PUSH
    ).exists()


@pytest.mark.django_db()
def test_no_preference_defaults_to_enabled(
    regular_user, board, webpush_settings, monkeypatch
) -> None:
    other = User.objects.create_user(username="user2", password="pw")
    _device(other)
    monkeypatch.setattr("kanban.webpush.send_webpush", lambda **_kwargs: None)
    event = _event(regular_user, board)

    dispatcher.process_outbox_events()

    delivery = NotificationDelivery.objects.get(
        event=event, user=other, channel=NotificationChannel.PUSH
    )
    assert delivery.status == NotificationDelivery.Status.SENT
