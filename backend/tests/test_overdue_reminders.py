from __future__ import annotations

from datetime import timedelta
from unittest.mock import patch

import pytest
from django.contrib.auth import get_user_model
from django.utils import timezone

from kanban.models import Board, Card, Column, NotificationProfile
from kanban.tasks import send_overdue_card_reminders

User = get_user_model()


@pytest.mark.django_db()
def test_overdue_reminder_skips_done_column_by_flag() -> None:
    board = Board.objects.create(name="Board")
    done_column = Column.objects.create(board=board, name="Done", is_done=True)
    Card.objects.create(
        column=done_column,
        title="Completed",
        deadline=timezone.now() - timedelta(hours=1),
    )

    user = User.objects.create_user(username="user1", password="secret123")
    NotificationProfile.objects.create(user=user, onesignal_player_id="player-1")

    with patch("kanban.tasks._send_push") as send_push:
        send_overdue_card_reminders.run()

    send_push.assert_not_called()


@pytest.mark.django_db()
def test_overdue_reminder_skips_legacy_done_column_without_flag() -> None:
    board = Board.objects.create(name="Board")
    done_column = Column.objects.create(board=board, name="Done", is_done=False)
    Card.objects.create(
        column=done_column,
        title="Legacy completed",
        deadline=timezone.now() - timedelta(hours=1),
    )

    user = User.objects.create_user(username="user1", password="secret123")
    NotificationProfile.objects.create(user=user, onesignal_player_id="player-1")

    with patch("kanban.tasks._send_push") as send_push:
        send_overdue_card_reminders.run()

    send_push.assert_not_called()
