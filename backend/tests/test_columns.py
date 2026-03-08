from __future__ import annotations

import pytest
from rest_framework.test import APIClient

from kanban.models import Board, Column


@pytest.mark.django_db()
def test_list_columns_empty(api_client: APIClient, board: Board) -> None:
    resp = api_client.get(f"/api/v1/columns/?board={board.id}")
    assert resp.status_code == 200
    assert resp.json() == []


@pytest.mark.django_db()
def test_create_column(api_client: APIClient, board: Board) -> None:
    resp = api_client.post(
        "/api/v1/columns/",
        data={"board": board.id, "name": "Backlog", "icon": "📦"},
        format="json",
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["name"] == "Backlog"
    assert data["icon"] == "📦"
    assert data["board"] == board.id
    assert Column.objects.filter(board=board, name="Backlog").exists()


@pytest.mark.django_db()
def test_create_column_without_icon(api_client: APIClient, board: Board) -> None:
    resp = api_client.post(
        "/api/v1/columns/",
        data={"board": board.id, "name": "Done"},
        format="json",
    )
    assert resp.status_code == 201
    assert resp.json()["name"] == "Done"


@pytest.mark.django_db()
def test_list_columns_filter_by_board(api_client: APIClient) -> None:
    b1 = Board.objects.create(name="Board 1")
    b2 = Board.objects.create(name="Board 2")
    Column.objects.create(board=b1, name="Col A")
    Column.objects.create(board=b2, name="Col B")

    resp = api_client.get(f"/api/v1/columns/?board={b1.id}")
    assert resp.status_code == 200
    names = [c["name"] for c in resp.json()]
    assert "Col A" in names
    assert "Col B" not in names


@pytest.mark.django_db()
def test_update_column(api_client: APIClient, column: Column) -> None:
    resp = api_client.patch(
        f"/api/v1/columns/{column.id}/",
        data={"name": "In Progress", "icon": "🔄"},
        format="json",
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["name"] == "In Progress"
    assert data["icon"] == "🔄"

    column.refresh_from_db()
    assert column.name == "In Progress"


@pytest.mark.django_db()
def test_delete_column(api_client: APIClient, board: Board) -> None:
    col = Column.objects.create(board=board, name="Temp")
    col_id = col.id
    resp = api_client.delete(f"/api/v1/columns/{col_id}/")
    assert resp.status_code == 204
    assert not Column.objects.filter(id=col_id).exists()


@pytest.mark.django_db()
def test_delete_column_cascades_cards(api_client: APIClient, column: Column) -> None:
    from kanban.models import Card

    card = Card.objects.create(column=column, title="My Card")
    resp = api_client.delete(f"/api/v1/columns/{column.id}/")
    assert resp.status_code == 204
    assert not Card.objects.filter(id=card.id).exists()


@pytest.mark.django_db()
def test_column_version_increments_on_update(api_client: APIClient, column: Column) -> None:
    original_version = column.version
    api_client.patch(
        f"/api/v1/columns/{column.id}/",
        data={"name": "Updated"},
        format="json",
    )
    column.refresh_from_db()
    assert column.version == original_version + 1


@pytest.mark.django_db()
def test_column_requires_board(api_client: APIClient) -> None:
    resp = api_client.post(
        "/api/v1/columns/",
        data={"name": "Orphan"},
        format="json",
    )
    assert resp.status_code == 400


@pytest.mark.django_db()
def test_column_404_on_nonexistent(api_client: APIClient) -> None:
    resp = api_client.get("/api/v1/columns/99999/")
    assert resp.status_code == 404
