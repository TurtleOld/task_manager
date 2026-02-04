from __future__ import annotations

import json
import pytest
from rest_framework.test import APIClient

from kanban.models import Board


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

    # list non-empty
    resp = client.get("/api/v1/boards/")
    assert resp.status_code == 200
    data = resp.json()
    assert any(item["name"] == "My Board" for item in data)
