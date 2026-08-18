from __future__ import annotations

import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from kanban.models import Board, Card, Column


@pytest.mark.django_db()
def test_archive_lists_archived_cards_without_columns(auth_client: APIClient) -> None:
    board = Board.objects.create(name="Home")
    column = Column.objects.create(board=board, name="To Do")
    card = Card.objects.create(column=column, title="Old task")

    auth_client.delete(f"/api/v1/cards/{card.id}/")
    # Columns are an internal implementation detail now — there is no API to
    # archive one, but the archive response still must not surface it.
    column.archived_at = timezone.now()
    column.save(update_fields=["archived_at"])

    resp = auth_client.get("/api/v1/archive/")

    assert resp.status_code == 200
    data = resp.json()
    assert [item["id"] for item in data["cards"]] == [card.id]
    assert data["cards"][0]["board_name"] == "Home"
    assert "column_name" not in data["cards"][0]
    assert "columns" not in data


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
def test_archive_requires_auth(api_client: APIClient) -> None:
    resp = api_client.get("/api/v1/archive/")
    assert resp.status_code in {401, 403}
