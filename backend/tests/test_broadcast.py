from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest
from rest_framework.test import APIClient

from kanban.models import Board, Card, Column

# ---------------------------------------------------------------------------
# Unit tests for broadcast_board_event helper
# ---------------------------------------------------------------------------


def test_broadcast_no_op_when_no_channel_layer() -> None:
    """broadcast_board_event must not raise when channel layer is None."""
    from kanban.broadcast import broadcast_board_event

    with patch("kanban.broadcast.get_channel_layer", return_value=None):
        # Should silently do nothing
        broadcast_board_event(board_id=1, event_type="card.created", data={"card": {}})


def test_broadcast_calls_group_send() -> None:
    """broadcast_board_event calls channel_layer.group_send with correct group name."""
    from kanban.broadcast import broadcast_board_event

    mock_layer = MagicMock()
    # async_to_sync wraps the coroutine — patch it to call our mock synchronously
    with (
        patch("kanban.broadcast.get_channel_layer", return_value=mock_layer),
        patch("kanban.broadcast.async_to_sync", side_effect=lambda f: f),
    ):
        broadcast_board_event(board_id=42, event_type="card.created", data={"card": {"id": 1}})

    mock_layer.group_send.assert_called_once()
    call_args = mock_layer.group_send.call_args
    group_name = call_args[0][0]
    message = call_args[0][1]

    assert group_name == "board_42"
    assert message["type"] == "board.event"
    assert message["data"]["type"] == "card.created"
    assert message["data"]["card"]["id"] == 1


def test_broadcast_swallows_exceptions() -> None:
    """A broken channel layer must not propagate errors to callers."""
    from kanban.broadcast import broadcast_board_event

    mock_layer = MagicMock()
    mock_layer.group_send.side_effect = RuntimeError("Redis is down")

    with (
        patch("kanban.broadcast.get_channel_layer", return_value=mock_layer),
        patch("kanban.broadcast.async_to_sync", side_effect=lambda f: f),
    ):
        # Should not raise
        broadcast_board_event(board_id=1, event_type="board.updated", data={})


def test_board_group_name_format() -> None:
    from kanban.consumers import board_group_name

    assert board_group_name(7) == "board_7"
    assert board_group_name("99") == "board_99"


# ---------------------------------------------------------------------------
# Integration: CRUD actions trigger broadcast
# ---------------------------------------------------------------------------


@pytest.mark.django_db()
def test_create_card_broadcasts(api_client: APIClient, column: Column) -> None:
    captured: list[dict] = []

    def fake_broadcast(board_id: int, event_type: str, data: dict) -> None:
        captured.append({"board_id": board_id, "event_type": event_type, "data": data})

    with patch("kanban.views.broadcast_board_event", side_effect=fake_broadcast):
        api_client.post(
            "/api/v1/cards/",
            data={"column": column.id, "title": "WS Task"},
            format="json",
        )

    assert len(captured) == 1
    assert captured[0]["event_type"] == "card.created"
    assert captured[0]["board_id"] == column.board_id
    assert captured[0]["data"]["card"]["title"] == "WS Task"


@pytest.mark.django_db()
def test_update_card_broadcasts(api_client: APIClient, card: Card) -> None:
    captured: list[dict] = []

    def fake_broadcast(board_id: int, event_type: str, data: dict) -> None:
        captured.append({"board_id": board_id, "event_type": event_type, "data": data})

    with patch("kanban.views.broadcast_board_event", side_effect=fake_broadcast):
        api_client.patch(
            f"/api/v1/cards/{card.id}/",
            data={"title": "Updated"},
            format="json",
        )

    assert any(e["event_type"] == "card.updated" for e in captured)


@pytest.mark.django_db()
def test_delete_card_broadcasts(api_client: APIClient, card: Card) -> None:
    captured: list[dict] = []

    def fake_broadcast(board_id: int, event_type: str, data: dict) -> None:
        captured.append({"board_id": board_id, "event_type": event_type, "data": data})

    card_id = card.id

    with patch("kanban.views.broadcast_board_event", side_effect=fake_broadcast):
        api_client.delete(f"/api/v1/cards/{card_id}/")

    assert any(
        e["event_type"] == "card.deleted" and e["data"]["card_id"] == card_id for e in captured
    )


@pytest.mark.django_db()
def test_move_card_broadcasts(api_client: APIClient) -> None:
    board = Board.objects.create(name="B")
    col1 = Column.objects.create(board=board, name="C1")
    col2 = Column.objects.create(board=board, name="C2")
    card = Card.objects.create(column=col1, title="Move me")

    captured: list[dict] = []

    def fake_broadcast(board_id: int, event_type: str, data: dict) -> None:
        captured.append({"board_id": board_id, "event_type": event_type, "data": data})

    with patch("kanban.views.broadcast_board_event", side_effect=fake_broadcast):
        api_client.post(
            f"/api/v1/cards/{card.id}/move/",
            data={"to_column": col2.id},
            format="json",
        )

    assert any(e["event_type"] == "card.moved" for e in captured)


@pytest.mark.django_db()
def test_create_column_broadcasts(api_client: APIClient, board: Board) -> None:
    captured: list[dict] = []

    def fake_broadcast(board_id: int, event_type: str, data: dict) -> None:
        captured.append({"board_id": board_id, "event_type": event_type, "data": data})

    with patch("kanban.views.broadcast_board_event", side_effect=fake_broadcast):
        api_client.post(
            "/api/v1/columns/",
            data={"board": board.id, "name": "Sprint"},
            format="json",
        )

    assert any(e["event_type"] == "column.created" for e in captured)


@pytest.mark.django_db()
def test_delete_column_broadcasts(api_client: APIClient, column: Column) -> None:
    captured: list[dict] = []

    def fake_broadcast(board_id: int, event_type: str, data: dict) -> None:
        captured.append({"board_id": board_id, "event_type": event_type, "data": data})

    col_id = column.id
    with patch("kanban.views.broadcast_board_event", side_effect=fake_broadcast):
        api_client.delete(f"/api/v1/columns/{col_id}/")

    assert any(
        e["event_type"] == "column.deleted" and e["data"]["column_id"] == col_id for e in captured
    )


@pytest.mark.django_db()
def test_update_board_broadcasts(api_client: APIClient, board: Board) -> None:
    captured: list[dict] = []

    def fake_broadcast(board_id: int, event_type: str, data: dict) -> None:
        captured.append({"board_id": board_id, "event_type": event_type, "data": data})

    with patch("kanban.views.broadcast_board_event", side_effect=fake_broadcast):
        api_client.patch(
            f"/api/v1/boards/{board.id}/",
            data={"name": "Renamed"},
            format="json",
        )

    assert any(e["event_type"] == "board.updated" for e in captured)
