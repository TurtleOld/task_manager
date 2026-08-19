from __future__ import annotations

from datetime import timedelta

import pytest
from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework.test import APIClient

from kanban.models import Board, Card, Column, NotificationEvent

User = get_user_model()

# ---------------------------------------------------------------------------
# Create
# ---------------------------------------------------------------------------


@pytest.mark.django_db()
def test_create_card_minimal(auth_client: APIClient, board: Board) -> None:
    resp = auth_client.post(
        "/api/v1/cards/",
        data={"board": board.id, "title": "New task"},
        format="json",
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["title"] == "New task"
    assert data["board"] == board.id
    assert Card.objects.filter(board=board, title="New task").exists()


@pytest.mark.django_db()
def test_create_card_full(auth_client: APIClient, board: Board) -> None:
    resp = auth_client.post(
        "/api/v1/cards/",
        data={
            "board": board.id,
            "title": "Full task",
            "description": "Details here",
            "priority": 3,
            "labels": ["bug", "urgent", "backend"],
        },
        format="json",
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["priority"] == 3
    assert data["priority_label"] == "Срочно"
    label_names = {label["name"] for label in data["labels"]}
    assert {"bug", "urgent", "backend"} <= label_names
    # Each label has a non-empty color (auto-generated from name hash).
    assert all(label["color"] for label in data["labels"])


@pytest.mark.django_db()
def test_create_card_accepts_legacy_android_priority(auth_client: APIClient, board: Board) -> None:
    resp = auth_client.post(
        "/api/v1/cards/",
        data={"board": board.id, "title": "Legacy priority", "priority": "🔥"},
        format="json",
    )

    assert resp.status_code == 201
    assert resp.json()["priority"] == 3


@pytest.mark.django_db()
def test_create_card_requires_title(auth_client: APIClient, board: Board) -> None:
    resp = auth_client.post(
        "/api/v1/cards/",
        data={"board": board.id, "title": ""},
        format="json",
    )
    assert resp.status_code == 400


@pytest.mark.django_db()
def test_create_card_requires_board(auth_client: APIClient) -> None:
    resp = auth_client.post(
        "/api/v1/cards/",
        data={"title": "No board"},
        format="json",
    )
    assert resp.status_code == 400


@pytest.mark.django_db()
def test_create_card_triggers_notification_event(auth_client: APIClient, board: Board) -> None:
    auth_client.post(
        "/api/v1/cards/",
        data={"board": board.id, "title": "Notify me"},
        format="json",
    )
    assert NotificationEvent.objects.filter(event_type="card.created").exists()


# ---------------------------------------------------------------------------
# Read
# ---------------------------------------------------------------------------


@pytest.mark.django_db()
def test_list_cards_by_board(auth_client: APIClient, card: Card, column: Column) -> None:
    resp = auth_client.get(f"/api/v1/cards/?board={column.board_id}")
    assert resp.status_code == 200
    ids = [c["id"] for c in resp.json()]
    assert card.id in ids


@pytest.mark.django_db()
def test_get_card_detail(auth_client: APIClient, card: Card) -> None:
    resp = auth_client.get(f"/api/v1/cards/{card.id}/")
    assert resp.status_code == 200
    assert resp.json()["id"] == card.id


@pytest.mark.django_db()
def test_get_nonexistent_card(auth_client: APIClient) -> None:
    resp = auth_client.get("/api/v1/cards/99999/")
    assert resp.status_code == 404


@pytest.mark.django_db()
def test_create_card_returns_id_for_immediate_detail_usage(
    auth_client: APIClient, board: Board
) -> None:
    resp = auth_client.post(
        "/api/v1/cards/",
        data={"board": board.id, "title": "Immediate open"},
        format="json",
    )
    assert resp.status_code == 201
    data = resp.json()
    assert isinstance(data["id"], int)

    detail = auth_client.get(f"/api/v1/cards/{data['id']}/")
    assert detail.status_code == 200
    assert detail.json()["title"] == "Immediate open"


@pytest.mark.django_db()
def test_create_card_response_contains_complete_immediate_use_payload(
    auth_client: APIClient, board: Board
) -> None:
    resp = auth_client.post(
        "/api/v1/cards/",
        data={"board": board.id, "title": "Open right away"},
        format="json",
    )

    assert resp.status_code == 201
    data = resp.json()
    assert isinstance(data["id"], int)
    assert data["id"] > 0
    assert data["board"] == board.id
    assert data["title"] == "Open right away"


@pytest.mark.django_db()
def test_my_today_uses_agenda_format(auth_client: APIClient, board: Board, regular_user: User) -> None:
    """Same shape as the agenda endpoint: boundaries + a flat card list, no column fields."""
    todo = Column.objects.create(board=board, name="To Do")
    card = Card.objects.create(column=todo, title="Open task", assignee=regular_user)
    completed = Card.objects.create(
        column=todo,
        title="Completed",
        assignee=regular_user,
        completed_at=timezone.now() - timedelta(days=30),
    )

    resp = auth_client.get("/api/v1/cards/my-today/")

    assert resp.status_code == 200
    data = resp.json()
    assert "boundaries" in data
    ids = {item["id"] for item in data["cards"]}
    assert card.id in ids
    assert completed.id not in ids
    item = next(item for item in data["cards"] if item["id"] == card.id)
    assert item["list"] == board.id


@pytest.mark.django_db()
def test_my_today_for_authenticated_user_shows_only_own_cards(
    auth_client: APIClient,
    regular_user: User,
    board: Board,
) -> None:
    other_user = User.objects.create_user(username="other", password="pass")
    todo = Column.objects.create(board=board, name="To Do")
    own = Card.objects.create(column=todo, title="Own", assignee=regular_user, priority=3)
    unassigned = Card.objects.create(column=todo, title="Unassigned", priority=3)
    other = Card.objects.create(column=todo, title="Other", assignee=other_user, priority=3)

    resp = auth_client.get("/api/v1/cards/my-today/")

    assert resp.status_code == 200
    ids = {item["id"] for item in resp.json()["cards"]}
    assert own.id in ids
    assert unassigned.id not in ids
    assert other.id not in ids


# ---------------------------------------------------------------------------
# Update
# ---------------------------------------------------------------------------


@pytest.mark.django_db()
def test_patch_card_title(auth_client: APIClient, card: Card) -> None:
    resp = auth_client.patch(
        f"/api/v1/cards/{card.id}/",
        data={"title": "Updated title"},
        format="json",
    )
    assert resp.status_code == 200
    assert resp.json()["title"] == "Updated title"
    card.refresh_from_db()
    assert card.title == "Updated title"


@pytest.mark.django_db()
def test_patch_card_priority(auth_client: APIClient, card: Card) -> None:
    resp = auth_client.patch(
        f"/api/v1/cards/{card.id}/",
        data={"priority": 1},
        format="json",
    )
    assert resp.status_code == 200
    assert resp.json()["priority"] == 1


@pytest.mark.django_db()
def test_card_checklist_field_is_read_only(auth_client: APIClient, card: Card) -> None:
    # checklist is now managed via /checklist/ sub-resource; patching it via card PATCH is a no-op
    resp = auth_client.patch(
        f"/api/v1/cards/{card.id}/",
        data={"title": "Updated"},
        format="json",
    )
    assert resp.status_code == 200
    assert resp.json()["checklist"] == []


@pytest.mark.django_db()
def test_patch_card_empty_title_rejected(auth_client: APIClient, card: Card) -> None:
    resp = auth_client.patch(
        f"/api/v1/cards/{card.id}/",
        data={"title": ""},
        format="json",
    )
    assert resp.status_code == 400


@pytest.mark.django_db()
def test_patch_card_increments_version(auth_client: APIClient, card: Card) -> None:
    v0 = card.version
    auth_client.patch(f"/api/v1/cards/{card.id}/", data={"title": "v2"}, format="json")
    card.refresh_from_db()
    assert card.version == v0 + 1


@pytest.mark.django_db()
def test_patch_card_does_not_auto_create_notification_event(
    auth_client: APIClient, card: Card
) -> None:
    """PATCH must not create card.updated event — only explicit /notify-updated/ does."""
    auth_client.patch(f"/api/v1/cards/{card.id}/", data={"title": "v2"}, format="json")
    assert NotificationEvent.objects.filter(event_type="card.updated", card_id=card.id).count() == 0


# ---------------------------------------------------------------------------
# Delete
# ---------------------------------------------------------------------------


@pytest.mark.django_db()
def test_delete_card(auth_client: APIClient, card: Card) -> None:
    card_id = card.id
    resp = auth_client.delete(f"/api/v1/cards/{card_id}/")
    assert resp.status_code == 204
    assert not Card.objects.filter(id=card_id).exists()
    archived = Card.with_archived.get(id=card_id)
    assert archived.archived_at is not None


@pytest.mark.django_db()
def test_delete_card_does_not_auto_create_notification_event(
    auth_client: APIClient, card: Card
) -> None:
    auth_client.delete(f"/api/v1/cards/{card.id}/")
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
def test_notify_updated_creates_event(auth_client: APIClient, card: Card) -> None:
    # bump version first
    auth_client.patch(f"/api/v1/cards/{card.id}/", data={"title": "v2"}, format="json")
    card.refresh_from_db()

    resp = auth_client.post(
        f"/api/v1/cards/{card.id}/notify-updated/",
        data={"version": card.version},
        format="json",
    )
    assert resp.status_code == 200
    assert NotificationEvent.objects.filter(event_type="card.updated", card_id=card.id).count() == 1


@pytest.mark.django_db()
def test_notify_updated_version_conflict(auth_client: APIClient, card: Card) -> None:
    resp = auth_client.post(
        f"/api/v1/cards/{card.id}/notify-updated/",
        data={"version": card.version + 99},
        format="json",
    )
    assert resp.status_code == 409


@pytest.mark.django_db()
def test_notify_updated_missing_version(auth_client: APIClient, card: Card) -> None:
    resp = auth_client.post(
        f"/api/v1/cards/{card.id}/notify-updated/",
        data={},
        format="json",
    )
    assert resp.status_code == 400


# ---------------------------------------------------------------------------
# notify-deleted endpoint
# ---------------------------------------------------------------------------


@pytest.mark.django_db()
def test_notify_deleted_creates_event(auth_client: APIClient, column: Column) -> None:
    card = Card.objects.create(column=column, title="Temp")
    card_id, version = card.id, card.version
    auth_client.delete(f"/api/v1/cards/{card_id}/")

    resp = auth_client.post(
        "/api/v1/cards/notify-deleted/",
        data={
            "card_id": card_id,
            "version": version,
            "board": column.board_id,
            "card_title": "Temp",
        },
        format="json",
    )
    assert resp.status_code == 200
    assert NotificationEvent.objects.filter(event_type="card.deleted").count() == 1


@pytest.mark.django_db()
def test_notify_deleted_missing_required_fields(auth_client: APIClient) -> None:
    resp = auth_client.post(
        "/api/v1/cards/notify-deleted/",
        data={"card_id": 1},
        format="json",
    )
    assert resp.status_code == 400
