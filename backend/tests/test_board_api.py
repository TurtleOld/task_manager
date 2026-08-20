from __future__ import annotations

import pytest
from rest_framework.test import APIClient

from kanban.models import Board, Column


@pytest.mark.django_db()
def test_boards_requires_authentication() -> None:
    resp = APIClient().get("/api/v1/boards/")
    assert resp.status_code == 401


@pytest.mark.django_db()
def test_boards_list_and_create(auth_client: APIClient) -> None:
    client = auth_client
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
def test_boards_list_includes_legacy_inbox_boards(auth_client: APIClient, regular_user) -> None:
    client = auth_client
    Board.objects.create(name="Home")
    Board.objects.create(owner=regular_user, is_inbox=True, name="Inbox")

    resp = client.get("/api/v1/boards/")

    assert resp.status_code == 200
    names = [item["name"] for item in resp.json()]
    assert names == ["Home", "Inbox"]
