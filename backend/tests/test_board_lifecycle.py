from __future__ import annotations

from unittest.mock import patch

import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from kanban.models import (
    Attachment,
    Board,
    Card,
    CardActivity,
    CardComment,
    Column,
    NotificationEvent,
)


def _archive(board: Board) -> None:
    board.archived_at = timezone.now()
    board.save(update_fields=["archived_at"])


@pytest.mark.django_db()
def test_archive_active_board_moves_it_to_archive(
    auth_client: APIClient, board: Board
) -> None:
    resp = auth_client.post(f"/api/v1/boards/{board.id}/archive/")

    assert resp.status_code == 200
    board.refresh_from_db()
    assert board.archived_at is not None
    assert auth_client.get("/api/v1/boards/").json() == []
    archive = auth_client.get("/api/v1/archive/").json()
    assert [item["id"] for item in archive["boards"]] == [board.id]


@pytest.mark.django_db()
def test_unarchive_archived_board_returns_it_to_active(
    auth_client: APIClient, board: Board
) -> None:
    _archive(board)

    resp = auth_client.post(f"/api/v1/boards/{board.id}/unarchive/")

    assert resp.status_code == 200
    board.refresh_from_db()
    assert board.archived_at is None
    names = [item["id"] for item in auth_client.get("/api/v1/boards/").json()]
    assert names == [board.id]


@pytest.mark.django_db()
def test_delete_archived_board_removes_all_content(
    auth_client: APIClient, regular_user
) -> None:
    board = Board.objects.create(name="Doomed")
    column = Column.objects.create(board=board, name="To Do")
    card = Card.objects.create(column=column, title="Task")
    CardComment.objects.create(card=card, author=regular_user, text="Note")
    CardActivity.objects.create(card=card, actor=regular_user, action="created")
    Attachment.objects.create(card=card, name="file.txt")
    _archive(board)

    resp = auth_client.delete(f"/api/v1/boards/{board.id}/")

    assert resp.status_code == 204
    assert not Board.with_archived.filter(id=board.id).exists()
    assert not Column.with_archived.filter(board_id=board.id).exists()
    assert not Card.with_archived.filter(board_id=board.id).exists()
    assert not CardComment.objects.filter(card_id=card.id).exists()
    assert not CardActivity.objects.filter(card_id=card.id).exists()
    assert not Attachment.objects.filter(card_id=card.id).exists()


@pytest.mark.django_db()
def test_delete_active_board_returns_400(auth_client: APIClient, board: Board) -> None:
    resp = auth_client.delete(f"/api/v1/boards/{board.id}/")

    assert resp.status_code == 400
    assert Board.with_archived.filter(id=board.id).exists()


@pytest.mark.django_db()
def test_unarchive_active_board_returns_400(
    auth_client: APIClient, board: Board
) -> None:
    resp = auth_client.post(f"/api/v1/boards/{board.id}/unarchive/")

    assert resp.status_code == 400
    board.refresh_from_db()
    assert board.archived_at is None


@pytest.mark.django_db()
def test_archive_archived_board_returns_400(
    auth_client: APIClient, board: Board
) -> None:
    _archive(board)
    archived_at = board.archived_at

    resp = auth_client.post(f"/api/v1/boards/{board.id}/archive/")

    assert resp.status_code == 400
    board.refresh_from_db()
    assert board.archived_at == archived_at


@pytest.mark.django_db()
@pytest.mark.parametrize(
    "method,path",
    [("post", "archive"), ("post", "unarchive"), ("delete", "")],
)
def test_board_lifecycle_missing_board_returns_404(
    auth_client: APIClient, method: str, path: str
) -> None:
    suffix = f"{path}/" if path else ""
    resp = getattr(auth_client, method)(f"/api/v1/boards/999999/{suffix}")

    assert resp.status_code == 404


@pytest.mark.django_db()
def test_force_delete_endpoint_is_gone(auth_client: APIClient, board: Board) -> None:
    _archive(board)

    resp = auth_client.delete(f"/api/v1/boards/{board.id}/force-delete/")

    assert resp.status_code == 404


@pytest.mark.django_db()
def test_delete_archived_board_notifies_and_broadcasts(
    auth_client: APIClient, board: Board, django_capture_on_commit_callbacks
) -> None:
    _archive(board)
    captured: list[dict] = []

    def fake_broadcast(board_id: int, event_type: str, data: dict) -> None:
        captured.append({"board_id": board_id, "event_type": event_type, "data": data})

    with patch("kanban.views.boards.broadcast_board_event", side_effect=fake_broadcast):
        with django_capture_on_commit_callbacks(execute=True):
            resp = auth_client.delete(f"/api/v1/boards/{board.id}/")

    assert resp.status_code == 204
    assert NotificationEvent.objects.filter(event_type="board.deleted").exists()
    assert any(event["event_type"] == "board.deleted" for event in captured)
