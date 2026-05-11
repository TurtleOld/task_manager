from __future__ import annotations

import pytest
from rest_framework.test import APIClient

from kanban.models import Board, Card, Column


@pytest.mark.django_db()
def test_archive_lists_archived_cards_and_columns(auth_client: APIClient) -> None:
    board = Board.objects.create(name="Home")
    column = Column.objects.create(board=board, name="To Do")
    card = Card.objects.create(column=column, title="Old task")

    auth_client.delete(f"/api/v1/cards/{card.id}/")
    auth_client.delete(f"/api/v1/columns/{column.id}/")

    resp = auth_client.get("/api/v1/archive/")

    assert resp.status_code == 200
    data = resp.json()
    assert [item["id"] for item in data["cards"]] == [card.id]
    assert data["cards"][0]["board_name"] == "Home"
    assert data["cards"][0]["column_name"] == "To Do"
    assert [item["id"] for item in data["columns"]] == [column.id]
    assert data["columns"][0]["board_name"] == "Home"


@pytest.mark.django_db()
def test_restore_archived_card(auth_client: APIClient, column: Column) -> None:
    card = Card.objects.create(column=column, title="Restore me")
    auth_client.delete(f"/api/v1/cards/{card.id}/")

    resp = auth_client.post(f"/api/v1/cards/{card.id}/restore/")

    assert resp.status_code == 200
    assert resp.json()["id"] == card.id
    restored = Card.objects.get(id=card.id)
    assert restored.archived_at is None


@pytest.mark.django_db()
def test_restore_card_requires_active_column(auth_client: APIClient, column: Column) -> None:
    card = Card.objects.create(column=column, title="Restore later")
    auth_client.delete(f"/api/v1/cards/{card.id}/")
    auth_client.delete(f"/api/v1/columns/{column.id}/")

    resp = auth_client.post(f"/api/v1/cards/{card.id}/restore/")

    assert resp.status_code == 400


@pytest.mark.django_db()
def test_restore_archived_column(auth_client: APIClient, board: Board) -> None:
    column = Column.objects.create(board=board, name="Archive me")
    auth_client.delete(f"/api/v1/columns/{column.id}/")

    resp = auth_client.post(f"/api/v1/columns/{column.id}/restore/")

    assert resp.status_code == 200
    assert resp.json()["id"] == column.id
    restored = Column.objects.get(id=column.id)
    assert restored.archived_at is None


@pytest.mark.django_db()
def test_archive_requires_auth(api_client: APIClient) -> None:
    resp = api_client.get("/api/v1/archive/")
    assert resp.status_code in {401, 403}
