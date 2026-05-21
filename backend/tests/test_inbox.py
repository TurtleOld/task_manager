from __future__ import annotations

import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from kanban.models import Board, Card, Column, InboxSchedule
from kanban.tasks import process_inbox_schedules


@pytest.mark.django_db()
def test_inbox_endpoint_returns_user_inbox(auth_client: APIClient, regular_user: object) -> None:
    resp = auth_client.get("/api/v1/inbox/")

    assert resp.status_code == 200
    data = resp.json()
    assert data["board"]["name"] == "Inbox"
    assert data["column"]["name"] == "Inbox"
    assert data["cards"] == []
    assert Board.objects.filter(owner=regular_user, is_inbox=True).count() == 1


@pytest.mark.django_db()
def test_create_inbox_card(auth_client: APIClient, regular_user: object) -> None:
    resp = auth_client.post(
        "/api/v1/inbox/",
        data={"title": "Buy milk", "description": "2 liters"},
        format="json",
    )

    assert resp.status_code == 201
    data = resp.json()
    assert data["title"] == "Buy milk"
    inbox_board = Board.objects.get(owner=regular_user, is_inbox=True)
    assert data["board"] == inbox_board.id
    assert Card.objects.filter(board=inbox_board, title="Buy milk").exists()


@pytest.mark.django_db()
def test_inbox_cards_can_move_to_regular_board(
    auth_client: APIClient,
    regular_user: object,
) -> None:
    inbox_board = Board.objects.get(owner=regular_user, is_inbox=True)
    inbox_column = Column.objects.get(board=inbox_board, name="Inbox")
    card = Card.objects.create(column=inbox_column, title="Sort later")
    board = Board.objects.create(name="Home")
    target_column = Column.objects.create(board=board, name="To Do")

    move = auth_client.post(
        f"/api/v1/cards/{card.id}/move/",
        data={"to_column": target_column.id},
        format="json",
    )
    assert move.status_code == 200

    resp = auth_client.get("/api/v1/inbox/")
    assert resp.status_code == 200
    assert [item["id"] for item in resp.json()["cards"]] == []
    card.refresh_from_db()
    assert card.board_id == board.id
    assert card.column_id == target_column.id


@pytest.mark.django_db()
def test_inbox_schedule_moves_current_inbox_cards(
    auth_client: APIClient,
    regular_user: object,
) -> None:
    inbox_board = Board.objects.get(owner=regular_user, is_inbox=True)
    inbox_column = Column.objects.get(board=inbox_board, name="Inbox")
    card = Card.objects.create(column=inbox_column, title="Scheduled sort")
    board = Board.objects.create(name="Work")
    target_column = Column.objects.create(board=board, name="To Do")

    resp = auth_client.post(
        "/api/v1/inbox/schedules/",
        data={
            "target_column": target_column.id,
            "move_at": (
                timezone.now() + timezone.timedelta(minutes=5)
            ).isoformat(),
        },
        format="json",
    )

    assert resp.status_code == 201
    schedule = InboxSchedule.objects.get(pk=resp.json()["id"])
    schedule.move_at = timezone.now() - timezone.timedelta(minutes=1)
    schedule.save(update_fields=["move_at", "updated_at", "version"])

    process_inbox_schedules()

    card.refresh_from_db()
    schedule.refresh_from_db()
    assert card.column_id == target_column.id
    assert card.board_id == board.id
    assert schedule.status == InboxSchedule.Status.COMPLETED
    assert schedule.moved_count == 1


@pytest.mark.django_db()
def test_inbox_requires_auth(api_client: APIClient) -> None:
    resp = api_client.get("/api/v1/inbox/")
    assert resp.status_code in {401, 403}
