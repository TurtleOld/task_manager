from __future__ import annotations

from datetime import timedelta
from unittest.mock import patch

import pytest
from django.contrib.auth import get_user_model
from django.utils import timezone

from kanban import dispatcher
from kanban.models import (
    Board,
    Card,
    Column,
    NotificationEvent,
    NotificationEventType,
    NotificationInboxEntry,
    NotificationPreference,
    NotificationProfile,
    PushDevice,
)
from kanban.tasks import send_overdue_card_reminders

User = get_user_model()


def _device(user, endpoint: str = "https://push.example.com/a") -> None:
    PushDevice.objects.create(
        user=user,
        kind=PushDevice.Kind.WEBPUSH,
        endpoint=endpoint,
        p256dh="p256dh-key",
        auth="auth-key",
    )


def _overdue_events() -> "list[NotificationEvent]":
    return list(NotificationEvent.objects.filter(dedupe_key__startswith="card.overdue:"))


@pytest.mark.django_db()
def test_overdue_reminder_skips_completed_cards(webpush_settings) -> None:
    board = Board.objects.create(name="Board")
    column = Column.objects.create(board=board, name="To Do")
    Card.objects.create(
        column=column,
        title="Completed",
        deadline=timezone.now() - timedelta(hours=1),
        completed_at=timezone.now(),
    )

    send_overdue_card_reminders.run()

    assert _overdue_events() == []


@pytest.mark.django_db()
def test_overdue_reminder_skips_archived_cards(webpush_settings) -> None:
    board = Board.objects.create(name="Board")
    column = Column.objects.create(board=board, name="To Do")
    card = Card.objects.create(
        column=column,
        title="Archived",
        deadline=timezone.now() - timedelta(hours=1),
    )
    card.archived_at = timezone.now()
    card.save(update_fields=["archived_at"])

    send_overdue_card_reminders.run()

    assert _overdue_events() == []


@pytest.mark.django_db()
def test_overdue_reminder_sends_for_open_card(webpush_settings) -> None:
    board = Board.objects.create(name="Board")
    column = Column.objects.create(board=board, name="To Do")
    Card.objects.create(
        column=column,
        title="Still open",
        deadline=timezone.now() - timedelta(hours=1),
    )

    user = User.objects.create_user(username="user1", password="secret123")
    NotificationProfile.objects.create(user=user)
    _device(user)

    with patch("kanban.webpush.send_webpush") as send_push:
        send_overdue_card_reminders.run()
        dispatcher.process_outbox_events()

    send_push.assert_called_once()


@pytest.mark.django_db()
def test_overdue_reminder_reaches_every_user_not_just_the_assignee(webpush_settings) -> None:
    """AUDIT-002: recipients follow the same broadcast rule as every other event."""
    board = Board.objects.create(name="Board")
    column = Column.objects.create(board=board, name="To Do")
    assignee = User.objects.create_user(username="assignee", password="secret123")
    other = User.objects.create_user(username="bystander", password="secret123")
    Card.objects.create(
        column=column,
        title="Still open",
        deadline=timezone.now() - timedelta(hours=1),
        assignee=assignee,
    )
    NotificationProfile.objects.create(user=assignee)
    NotificationProfile.objects.create(user=other)
    _device(assignee, "https://push.example.com/assignee")
    _device(other, "https://push.example.com/other")

    with patch("kanban.webpush.send_webpush"):
        send_overdue_card_reminders.run()
        dispatcher.process_outbox_events()

    event = NotificationEvent.objects.get(dedupe_key__startswith="card.overdue:")
    recipients = set(
        NotificationInboxEntry.objects.filter(event=event).values_list("user_id", flat=True)
    )
    assert recipients == {assignee.id, other.id}


@pytest.mark.django_db()
def test_overdue_reminder_respects_notification_preference(webpush_settings) -> None:
    board = Board.objects.create(name="Board")
    column = Column.objects.create(board=board, name="To Do")
    Card.objects.create(
        column=column,
        title="Still open",
        deadline=timezone.now() - timedelta(hours=1),
    )

    user = User.objects.create_user(username="user1", password="secret123")
    NotificationProfile.objects.create(user=user)
    _device(user)
    NotificationPreference.objects.create(
        user=user,
        channel="push",
        event_type=NotificationEventType.CARD_OVERDUE.value,
        enabled=False,
    )

    with patch("kanban.webpush.send_webpush") as send_push:
        send_overdue_card_reminders.run()
        dispatcher.process_outbox_events()

    send_push.assert_not_called()
    # Turning off push must not hide the card from the inbox entirely.
    event = NotificationEvent.objects.get(dedupe_key__startswith="card.overdue:")
    assert NotificationInboxEntry.objects.filter(event=event, user=user).exists()


@pytest.mark.django_db()
def test_overdue_reminder_is_not_redelivered_within_the_same_interval(
    webpush_settings,
) -> None:
    board = Board.objects.create(name="Board")
    column = Column.objects.create(board=board, name="To Do")
    Card.objects.create(
        column=column,
        title="Still open",
        deadline=timezone.now() - timedelta(hours=1),
    )

    user = User.objects.create_user(username="user1", password="secret123")
    NotificationProfile.objects.create(user=user)
    _device(user)

    with patch("kanban.webpush.send_webpush") as send_push:
        send_overdue_card_reminders.run()
        send_overdue_card_reminders.run()
        dispatcher.process_outbox_events()

    assert len(_overdue_events()) == 1
    send_push.assert_called_once()


@pytest.mark.django_db()
def test_overdue_reminder_fires_again_once_the_interval_elapses(
    webpush_settings, monkeypatch
) -> None:
    from kanban import tasks

    board = Board.objects.create(name="Board")
    column = Column.objects.create(board=board, name="To Do")
    Card.objects.create(
        column=column,
        title="Still open",
        deadline=timezone.now() - timedelta(hours=1),
    )

    user = User.objects.create_user(username="user1", password="secret123")
    NotificationProfile.objects.create(user=user)
    _device(user)

    with patch("kanban.webpush.send_webpush"):
        send_overdue_card_reminders.run()

        later = timezone.now() + timedelta(hours=1)
        monkeypatch.setattr(tasks.timezone, "now", lambda: later)
        send_overdue_card_reminders.run()

    assert len(_overdue_events()) == 2


@pytest.mark.django_db()
def test_overdue_reminder_uses_creator_timezone_over_board_owner(webpush_settings) -> None:
    owner = User.objects.create_user(username="owner", password="secret123")
    creator = User.objects.create_user(username="creator", password="secret123")
    board = Board.objects.create(name="Board", owner=owner)
    column = Column.objects.create(board=board, name="To Do")
    NotificationProfile.objects.create(user=owner, timezone="Europe/Moscow")
    NotificationProfile.objects.create(user=creator, timezone="Asia/Yekaterinburg")
    Card.objects.create(
        column=column,
        title="Still open",
        deadline=timezone.now() - timedelta(hours=1),
        created_by=creator,
    )

    send_overdue_card_reminders.run()

    event = NotificationEvent.objects.get(dedupe_key__startswith="card.overdue:")
    assert "Екатеринбург" not in event.summary  # sanity: no tz name leaks into text
    # The offset baked into the formatted deadline must reflect the creator's
    # timezone (+5), not the board owner's (+3) — asserted indirectly via the
    # helper used to build it.
    from kanban.tasks import _resolve_timezone_for_card

    card = Card.objects.get(title="Still open")
    assert _resolve_timezone_for_card(card=card) == "Asia/Yekaterinburg"


@pytest.mark.django_db()
def test_overdue_reminder_falls_back_to_board_owner_timezone(webpush_settings) -> None:
    owner = User.objects.create_user(username="owner", password="secret123")
    board = Board.objects.create(name="Board", owner=owner)
    column = Column.objects.create(board=board, name="To Do")
    NotificationProfile.objects.create(user=owner, timezone="Europe/Moscow")
    card = Card.objects.create(
        column=column,
        title="Still open",
        deadline=timezone.now() - timedelta(hours=1),
    )

    from kanban.tasks import _resolve_timezone_for_card

    assert _resolve_timezone_for_card(card=card) == "Europe/Moscow"


@pytest.mark.django_db()
def test_overdue_reminder_falls_back_to_utc_without_creator_or_owner(webpush_settings) -> None:
    board = Board.objects.create(name="Board")
    column = Column.objects.create(board=board, name="To Do")
    card = Card.objects.create(
        column=column,
        title="Still open",
        deadline=timezone.now() - timedelta(hours=1),
    )

    from kanban.tasks import _resolve_timezone_for_card

    assert _resolve_timezone_for_card(card=card) == "UTC"
