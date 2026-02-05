from __future__ import annotations

import json

import pytest
from django.test import Client


@pytest.mark.django_db()
def test_card_move_flow(client: Client) -> None:
    # Create board
    b = client.post("/api/v1/boards/", data={"name": "B"}, content_type="application/json")
    board = json.loads(b.content)
    # Create columns
    c1 = client.post(
        "/api/v1/columns/",
        data={"board": board["id"], "name": "Todo"},
        content_type="application/json",
    )
    col1 = json.loads(c1.content)
    c2 = client.post(
        "/api/v1/columns/",
        data={"board": board["id"], "name": "Doing"},
        content_type="application/json",
    )
    col2 = json.loads(c2.content)

    # Create two cards in col1
    r1 = client.post(
        "/api/v1/cards/",
        data={"column": col1["id"], "title": "A"},
        content_type="application/json",
    )
    json.loads(r1.content)
    r2 = client.post(
        "/api/v1/cards/",
        data={"column": col1["id"], "title": "B"},
        content_type="application/json",
    )
    card2 = json.loads(r2.content)

    # Move card2 to col2, at end
    m = client.post(
        f"/api/v1/cards/{card2['id']}/move/",
        data={"to_column": col2["id"]},
        content_type="application/json",
    )
    assert m.status_code == 200
    moved = json.loads(m.content)
    assert moved["column"] == col2["id"]
