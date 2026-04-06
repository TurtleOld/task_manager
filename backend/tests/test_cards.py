from __future__ import annotations

import pytest
from rest_framework.test import APIClient

from kanban.models import Board, Card, Column, NotificationEvent

# ---------------------------------------------------------------------------
# Create
# ---------------------------------------------------------------------------


@pytest.mark.django_db()
def test_create_card_minimal(api_client: APIClient, column: Column) -> None:
    resp = api_client.post(
        "/api/v1/cards/",
        data={"column": column.id, "title": "New task"},
        format="json",
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["title"] == "New task"
    assert data["column"] == column.id
    assert data["board"] == column.board_id
    assert Card.objects.filter(column=column, title="New task").exists()


@pytest.mark.django_db()
def test_create_card_full(api_client: APIClient, column: Column) -> None:
    resp = api_client.post(
        "/api/v1/cards/",
        data={
            "column": column.id,
            "title": "Full task",
            "description": "Details here",
            "priority": "🔥",
            "tags": ["bug", "urgent"],
            "categories": ["backend"],
        },
        format="json",
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["priority"] == "🔥"
    assert "bug" in data["tags"]
    assert "backend" in data["categories"]


@pytest.mark.django_db()
def test_create_card_requires_title(api_client: APIClient, column: Column) -> None:
    resp = api_client.post(
        "/api/v1/cards/",
        data={"column": column.id, "title": ""},
        format="json",
    )
    assert resp.status_code == 400


@pytest.mark.django_db()
def test_create_card_requires_column(api_client: APIClient) -> None:
    resp = api_client.post(
        "/api/v1/cards/",
        data={"title": "No column"},
        format="json",
    )
    assert resp.status_code == 400


@pytest.mark.django_db()
def test_create_card_triggers_notification_event(api_client: APIClient, column: Column) -> None:
    api_client.post(
        "/api/v1/cards/",
        data={"column": column.id, "title": "Notify me"},
        format="json",
    )
    assert NotificationEvent.objects.filter(event_type="card.created").exists()


# ---------------------------------------------------------------------------
# Read
# ---------------------------------------------------------------------------


@pytest.mark.django_db()
def test_list_cards_by_board(api_client: APIClient, card: Card, column: Column) -> None:
    resp = api_client.get(f"/api/v1/cards/?board={column.board_id}")
    assert resp.status_code == 200
    ids = [c["id"] for c in resp.json()]
    assert card.id in ids


@pytest.mark.django_db()
def test_list_cards_by_column(api_client: APIClient, card: Card, column: Column) -> None:
    other_col = Column.objects.create(board=column.board, name="Other")
    Card.objects.create(column=other_col, title="Other card")

    resp = api_client.get(f"/api/v1/cards/?column={column.id}")
    assert resp.status_code == 200
    titles = [c["title"] for c in resp.json()]
    assert card.title in titles
    assert "Other card" not in titles


@pytest.mark.django_db()
def test_get_card_detail(api_client: APIClient, card: Card) -> None:
    resp = api_client.get(f"/api/v1/cards/{card.id}/")
    assert resp.status_code == 200
    assert resp.json()["id"] == card.id


@pytest.mark.django_db()
def test_get_nonexistent_card(api_client: APIClient) -> None:
    resp = api_client.get("/api/v1/cards/99999/")
    assert resp.status_code == 404


@pytest.mark.django_db()
def test_create_card_returns_id_for_immediate_detail_usage(api_client: APIClient, column: Column) -> None:
    resp = api_client.post(
        "/api/v1/cards/",
        data={"column": column.id, "title": "Immediate open"},
        format="json",
    )
    assert resp.status_code == 201
    data = resp.json()
    assert isinstance(data["id"], int)

    detail = api_client.get(f"/api/v1/cards/{data['id']}/")
    assert detail.status_code == 200
    assert detail.json()["title"] == "Immediate open"


# ---------------------------------------------------------------------------
# Update
# ---------------------------------------------------------------------------


@pytest.mark.django_db()
def test_patch_card_title(api_client: APIClient, card: Card) -> None:
    resp = api_client.patch(
        f"/api/v1/cards/{card.id}/",
        data={"title": "Updated title"},
        format="json",
    )
    assert resp.status_code == 200
    assert resp.json()["title"] == "Updated title"
    card.refresh_from_db()
    assert card.title == "Updated title"


@pytest.mark.django_db()
def test_patch_card_priority(api_client: APIClient, card: Card) -> None:
    resp = api_client.patch(
        f"/api/v1/cards/{card.id}/",
        data={"priority": "🟢"},
        format="json",
    )
    assert resp.status_code == 200
    assert resp.json()["priority"] == "🟢"


@pytest.mark.django_db()
def test_patch_card_checklist(api_client: APIClient, card: Card) -> None:
    checklist = [{"id": "1", "text": "Step 1", "done": False}]
    resp = api_client.patch(
        f"/api/v1/cards/{card.id}/",
        data={"checklist": checklist},
        format="json",
    )
    assert resp.status_code == 200
    assert resp.json()["checklist"][0]["text"] == "Step 1"


@pytest.mark.django_db()
def test_patch_card_empty_title_rejected(api_client: APIClient, card: Card) -> None:
    resp = api_client.patch(
        f"/api/v1/cards/{card.id}/",
        data={"title": ""},
        format="json",
    )
    assert resp.status_code == 400


@pytest.mark.django_db()
def test_patch_card_increments_version(api_client: APIClient, card: Card) -> None:
    v0 = card.version
    api_client.patch(f"/api/v1/cards/{card.id}/", data={"title": "v2"}, format="json")
    card.refresh_from_db()
    assert card.version == v0 + 1


@pytest.mark.django_db()
def test_patch_card_does_not_auto_create_notification_event(
    api_client: APIClient, card: Card
) -> None:
    """PATCH must not create card.updated event — only explicit /notify-updated/ does."""
    api_client.patch(f"/api/v1/cards/{card.id}/", data={"title": "v2"}, format="json")
    assert NotificationEvent.objects.filter(event_type="card.updated", card_id=card.id).count() == 0


# ---------------------------------------------------------------------------
# Delete
# ---------------------------------------------------------------------------


@pytest.mark.django_db()
def test_delete_card(api_client: APIClient, card: Card) -> None:
    card_id = card.id
    resp = api_client.delete(f"/api/v1/cards/{card_id}/")
    assert resp.status_code == 204
    assert not Card.objects.filter(id=card_id).exists()


@pytest.mark.django_db()
def test_delete_card_does_not_auto_create_notification_event(
    api_client: APIClient, card: Card
) -> None:
    api_client.delete(f"/api/v1/cards/{card.id}/")
    assert NotificationEvent.objects.filter(event_type="card.deleted").count() == 0


# ---------------------------------------------------------------------------
# Version bumping: TimestampedModel
# ---------------------------------------------------------------------------


@pytest.mark.django_db()
def test_card_version_starts_at_1(card: Card) -> None:
    assert card.version == 1


@pytest.mark.django_db()
def test_card_board_denormalized_on_save(column: Column) -> None:
    """Card.board must always mirror column.board."""
    board2 = Board.objects.create(name="Board 2")
    col2 = Column.objects.create(board=board2, name="Col 2")
    card = Card.objects.create(column=col2, title="X")
    assert card.board_id == board2.id


# ---------------------------------------------------------------------------
# notify-updated endpoint
# ---------------------------------------------------------------------------


@pytest.mark.django_db()
def test_notify_updated_creates_event(api_client: APIClient, card: Card) -> None:
    # bump version first
    api_client.patch(f"/api/v1/cards/{card.id}/", data={"title": "v2"}, format="json")
    card.refresh_from_db()

    resp = api_client.post(
        f"/api/v1/cards/{card.id}/notify-updated/",
        data={"version": card.version},
        format="json",
    )
    assert resp.status_code == 200
    assert NotificationEvent.objects.filter(event_type="card.updated", card_id=card.id).count() == 1


@pytest.mark.django_db()
def test_notify_updated_version_conflict(api_client: APIClient, card: Card) -> None:
    resp = api_client.post(
        f"/api/v1/cards/{card.id}/notify-updated/",
        data={"version": card.version + 99},
        format="json",
    )
    assert resp.status_code == 409


@pytest.mark.django_db()
def test_notify_updated_missing_version(api_client: APIClient, card: Card) -> None:
    resp = api_client.post(
        f"/api/v1/cards/{card.id}/notify-updated/",
        data={},
        format="json",
    )
    assert resp.status_code == 400


# ---------------------------------------------------------------------------
# notify-deleted endpoint
# ---------------------------------------------------------------------------


@pytest.mark.django_db()
def test_notify_deleted_creates_event(api_client: APIClient, column: Column) -> None:
    card = Card.objects.create(column=column, title="Temp")
    card_id, version = card.id, card.version
    api_client.delete(f"/api/v1/cards/{card_id}/")

    resp = api_client.post(
        "/api/v1/cards/notify-deleted/",
        data={
            "card_id": card_id,
            "version": version,
            "board": column.board_id,
            "column": column.id,
            "card_title": "Temp",
        },
        format="json",
    )
    assert resp.status_code == 200
    assert NotificationEvent.objects.filter(event_type="card.deleted").count() == 1


@pytest.mark.django_db()
def test_notify_deleted_missing_required_fields(api_client: APIClient) -> None:
    resp = api_client.post(
        "/api/v1/cards/notify-deleted/",
        data={"card_id": 1},
        format="json",
    )
    assert resp.status_code == 400
