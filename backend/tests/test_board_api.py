from __future__ import annotations

import pytest
from rest_framework.test import APIClient

from kanban.models import Board, Column


@pytest.mark.django_db()
def test_boards_list_and_create() -> None:
    client = APIClient()
    # list empty
    resp = client.get("/api/v1/boards/")
    assert resp.status_code == 200
    data = resp.json()
    assert data == []

    # create
    resp = client.post(
        "/api/v1/boards/",
        data={"name": "My Board"},
        format="json",
    )
    assert resp.status_code == 201
    board_id = resp.json()["id"]
    assert Board.objects.filter(id=board_id, name="My Board").exists()
    columns = list(
        Column.objects.filter(board_id=board_id)
        .order_by("position")
        .values("name", "is_default", "is_done")
    )
    assert columns == [
        {"name": "To Do", "is_default": True, "is_done": False},
        {"name": "In Progress", "is_default": True, "is_done": False},
        {"name": "Done", "is_default": True, "is_done": True},
    ]

    # list non-empty
    resp = client.get("/api/v1/boards/")
    assert resp.status_code == 200
    data = resp.json()
    assert any(item["name"] == "My Board" for item in data)
