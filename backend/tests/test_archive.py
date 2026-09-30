from __future__ import annotations

import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from kanban.models import Board, Card, Column, NotificationEvent


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
def test_archive_active_card_moves_it_to_archive(
    auth_client: APIClient, card: Card
) -> None:
    resp = auth_client.post(f"/api/v1/cards/{card.id}/archive/")

    assert resp.status_code == 200
    assert resp.json()["id"] == card.id
    assert not Card.objects.filter(id=card.id).exists()
    archived = Card.with_archived.get(id=card.id)
    assert archived.archived_at is not None


@pytest.mark.django_db()
def test_archive_archived_card_returns_400(auth_client: APIClient, card: Card) -> None:
    auth_client.post(f"/api/v1/cards/{card.id}/archive/")

    resp = auth_client.post(f"/api/v1/cards/{card.id}/archive/")

    assert resp.status_code == 400


@pytest.mark.django_db()
def test_archive_missing_card_returns_404(auth_client: APIClient) -> None:
    resp = auth_client.post("/api/v1/cards/99999/archive/")
    assert resp.status_code == 404


@pytest.mark.django_db()
def test_archive_parent_archives_subtasks(
    auth_client: APIClient, card: Card
) -> None:
    subtask = Card.objects.create(column=card.column, parent=card, title="Sub")

    resp = auth_client.post(f"/api/v1/cards/{card.id}/archive/")

    assert resp.status_code == 200
    assert Card.with_archived.get(id=subtask.id).archived_at is not None
    assert resp.json()["subtasks"] == []


@pytest.mark.django_db()
def test_archive_action_creates_card_archived_event(
    auth_client: APIClient, card: Card
) -> None:
    auth_client.post(f"/api/v1/cards/{card.id}/archive/")

    events = NotificationEvent.objects.filter(event_type="card.archived", card_id=card.id)
    assert events.count() == 1


@pytest.mark.django_db()
def test_unarchive_archived_card_restores_it(auth_client: APIClient, card: Card) -> None:
    auth_client.post(f"/api/v1/cards/{card.id}/archive/")

    resp = auth_client.post(f"/api/v1/cards/{card.id}/unarchive/")

    assert resp.status_code == 200
    assert resp.json()["id"] == card.id
    restored = Card.objects.get(id=card.id)
    assert restored.archived_at is None


@pytest.mark.django_db()
def test_unarchive_active_card_returns_400(auth_client: APIClient, card: Card) -> None:
    resp = auth_client.post(f"/api/v1/cards/{card.id}/unarchive/")
    assert resp.status_code == 400


@pytest.mark.django_db()
def test_unarchive_missing_card_returns_404(auth_client: APIClient) -> None:
    resp = auth_client.post("/api/v1/cards/99999/unarchive/")
    assert resp.status_code == 404


@pytest.mark.django_db()
def test_restore_endpoint_removed(auth_client: APIClient, card: Card) -> None:
    auth_client.post(f"/api/v1/cards/{card.id}/archive/")

    resp = auth_client.post(f"/api/v1/cards/{card.id}/restore/")

    assert resp.status_code in {404, 405}


@pytest.mark.django_db()
def test_archive_requires_auth(api_client: APIClient) -> None:
    resp = api_client.get("/api/v1/archive/")
    assert resp.status_code in {401, 403}
