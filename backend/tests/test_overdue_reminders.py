from __future__ import annotations

from datetime import timedelta
from unittest.mock import patch

import pytest
from django.contrib.auth import get_user_model
from django.utils import timezone

from kanban.models import Board, Card, Column, NotificationProfile, PushDevice
from kanban.tasks import send_overdue_card_reminders

User = get_user_model()


@pytest.mark.django_db()
def test_overdue_reminder_skips_completed_cards() -> None:
    board = Board.objects.create(name="Board")
    column = Column.objects.create(board=board, name="To Do")
    Card.objects.create(
        column=column,
        title="Completed",
        deadline=timezone.now() - timedelta(hours=1),
        completed_at=timezone.now(),
    )

    user = User.objects.create_user(username="user1", password="secret123")
    NotificationProfile.objects.create(user=user)
    # Delivery now fans out over registered devices instead of one token field.
    PushDevice.objects.create(user=user, kind=PushDevice.Kind.FCM, token="fcm-token")

    with patch("kanban.tasks._send_push") as send_push:
        send_overdue_card_reminders.run()

    send_push.assert_not_called()


@pytest.mark.django_db()
def test_overdue_reminder_skips_archived_cards() -> None:
    board = Board.objects.create(name="Board")
    column = Column.objects.create(board=board, name="To Do")
    card = Card.objects.create(
        column=column,
        title="Archived",
        deadline=timezone.now() - timedelta(hours=1),
    )
    card.archived_at = timezone.now()
    card.save(update_fields=["archived_at"])

    user = User.objects.create_user(username="user1", password="secret123")
    NotificationProfile.objects.create(user=user)
    # Delivery now fans out over registered devices instead of one token field.
    PushDevice.objects.create(user=user, kind=PushDevice.Kind.FCM, token="fcm-token")

    with patch("kanban.tasks._send_push") as send_push:
        send_overdue_card_reminders.run()

    send_push.assert_not_called()


@pytest.mark.django_db()
def test_overdue_reminder_sends_for_open_card() -> None:
    board = Board.objects.create(name="Board")
    column = Column.objects.create(board=board, name="To Do")
    Card.objects.create(
        column=column,
        title="Still open",
        deadline=timezone.now() - timedelta(hours=1),
    )

    user = User.objects.create_user(username="user1", password="secret123")
    NotificationProfile.objects.create(user=user)
    # Delivery now fans out over registered devices instead of one token field.
    PushDevice.objects.create(user=user, kind=PushDevice.Kind.FCM, token="fcm-token")

    with patch("kanban.tasks._send_push") as send_push:
        send_overdue_card_reminders.run()

    send_push.assert_called_once()
