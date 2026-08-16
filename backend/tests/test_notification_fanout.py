from __future__ import annotations

import pytest
from django.contrib.auth import get_user_model

from kanban import tasks as tasks_module
from kanban.models import (
    NotificationChannel,
    NotificationDelivery,
    NotificationInboxEntry,
    NotificationPreference,
    NotificationProfile,
)
from kanban.notifications import create_notification_event
from kanban.tasks import deliver_notification_event, send_notification_event

User = get_user_model()


@pytest.fixture()
def _no_push(monkeypatch: pytest.MonkeyPatch) -> list[tuple[str, str, str]]:
    """Capture push sends instead of hitting FCM."""
    sent: list[tuple[str, str, str]] = []

    def _fake_push(token, title, message, **kwargs) -> None:
        sent.append((token, title, message))

    monkeypatch.setattr(tasks_module, "_send_push", _fake_push)
    return sent


def _event(actor, board):
    return create_notification_event(
        event_type="board.updated",
        actor=actor,
        board=board,
        summary="Обновлён список",
        payload={"board": board.name},
    )


@pytest.mark.django_db()
def test_fanout_writes_inbox_for_every_recipient(regular_user, board) -> None:
    other = User.objects.create_user(username="user2", password="pw")
    event = _event(regular_user, board)

    send_notification_event.run(event.id)

    recipients = set(
        NotificationInboxEntry.objects.filter(event=event).values_list("user_id", flat=True)
    )
    assert recipients == {regular_user.id, other.id}


@pytest.mark.django_db()
def test_fanout_is_idempotent(regular_user, board) -> None:
    """A retry of the fan-out must not duplicate inbox entries."""
    event = _event(regular_user, board)

    send_notification_event.run(event.id)
    send_notification_event.run(event.id)

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

    send_notification_event.run(event.id)

    recipients = set(
        NotificationInboxEntry.objects.filter(event=event).values_list("user_id", flat=True)
    )
    assert recipients == {mentioned.id}


@pytest.mark.django_db()
def test_delivery_sends_push_when_enabled(
    regular_user, board, _no_push: list[tuple[str, str, str]]
) -> None:
    NotificationProfile.objects.update_or_create(
        user=regular_user, defaults={"fcm_token": "tok", "email": ""}
    )
    event = _event(regular_user, board)

    deliver_notification_event.run(event.id, regular_user.id)

    assert len(_no_push) == 1
    delivery = NotificationDelivery.objects.get(
        event=event, user=regular_user, channel=NotificationChannel.PUSH
    )
    assert delivery.status == NotificationDelivery.Status.SENT


@pytest.mark.django_db()
def test_board_preference_overrides_global(
    regular_user, board, _no_push: list[tuple[str, str, str]]
) -> None:
    """Board-scoped preference wins over the global one (regression guard)."""
    NotificationProfile.objects.update_or_create(
        user=regular_user, defaults={"fcm_token": "tok", "email": ""}
    )
    NotificationPreference.objects.create(
        user=regular_user,
        board=None,
        channel=NotificationChannel.PUSH,
        event_type="board.updated",
        enabled=True,
    )
    NotificationPreference.objects.create(
        user=regular_user,
        board=board,
        channel=NotificationChannel.PUSH,
        event_type="board.updated",
        enabled=False,
    )
    event = _event(regular_user, board)

    deliver_notification_event.run(event.id, regular_user.id)

    assert _no_push == []


@pytest.mark.django_db()
def test_global_preference_applies_without_board_override(
    regular_user, board, _no_push: list[tuple[str, str, str]]
) -> None:
    NotificationProfile.objects.update_or_create(
        user=regular_user, defaults={"fcm_token": "tok", "email": ""}
    )
    NotificationPreference.objects.create(
        user=regular_user,
        board=None,
        channel=NotificationChannel.PUSH,
        event_type="board.updated",
        enabled=False,
    )
    event = _event(regular_user, board)

    deliver_notification_event.run(event.id, regular_user.id)

    assert _no_push == []


@pytest.mark.django_db()
def test_no_preference_defaults_to_enabled(
    regular_user, board, _no_push: list[tuple[str, str, str]]
) -> None:
    NotificationProfile.objects.update_or_create(
        user=regular_user, defaults={"fcm_token": "tok", "email": ""}
    )
    event = _event(regular_user, board)

    deliver_notification_event.run(event.id, regular_user.id)

    assert len(_no_push) == 1


@pytest.mark.django_db()
def test_one_failing_recipient_does_not_affect_others(
    regular_user, board, monkeypatch: pytest.MonkeyPatch
) -> None:
    """The reason for the split: a failure is scoped to one recipient."""
    other = User.objects.create_user(username="user2", password="pw")
    for user in (regular_user, other):
        NotificationProfile.objects.update_or_create(
            user=user, defaults={"fcm_token": f"tok-{user.id}", "email": ""}
        )

    def _fake_push(token, title, message, **kwargs) -> None:
        if token == f"tok-{regular_user.id}":
            raise RuntimeError("FCM down for this token")

    monkeypatch.setattr(tasks_module, "_send_push", _fake_push)
    event = _event(regular_user, board)

    deliver_notification_event.run(event.id, regular_user.id)
    deliver_notification_event.run(event.id, other.id)

    failed = NotificationDelivery.objects.get(event=event, user=regular_user)
    succeeded = NotificationDelivery.objects.get(event=event, user=other)
    assert failed.status == NotificationDelivery.Status.FAILED
    assert succeeded.status == NotificationDelivery.Status.SENT
