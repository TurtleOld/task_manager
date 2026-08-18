from __future__ import annotations

import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from kanban.models import Board, Column

User = get_user_model()


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
    # A new list starts empty — no default columns, no template data.
    assert not Column.objects.filter(board_id=board_id).exists()

    # list non-empty
    resp = client.get("/api/v1/boards/")
    assert resp.status_code == 200
    data = resp.json()
    assert any(item["name"] == "My Board" for item in data)


@pytest.mark.django_db()
def test_boards_list_hides_inbox_boards() -> None:
    client = APIClient()
    user = User.objects.create_user(username="alice", password="secret123")
    Board.objects.create(name="Home")
    Board.objects.create(owner=user, is_inbox=True, name="Inbox")

    resp = client.get("/api/v1/boards/")

    assert resp.status_code == 200
    names = [item["name"] for item in resp.json()]
    assert names == ["Home"]
