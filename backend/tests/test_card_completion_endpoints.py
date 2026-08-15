from __future__ import annotations

import pytest
from django.contrib.auth import get_user_model
from rest_framework.authtoken.models import Token
from rest_framework.test import APIClient

from kanban.models import Board, Card, CardActivity, Column, NotificationEvent

User = get_user_model()


def _client_for(user: User) -> APIClient:
    client = APIClient()
    token, _ = Token.objects.get_or_create(user=user)
    client.credentials(HTTP_AUTHORIZATION=f"Token {token.key}")
    return client


# ---------------------------------------------------------------------------
# Complete
# ---------------------------------------------------------------------------


@pytest.mark.django_db()
def test_complete_card_sets_moment_and_actor(
    regular_user: User, column: Column, card: Card
) -> None:
    client = _client_for(regular_user)

    resp = client.post(f"/api/v1/cards/{card.id}/complete/")

    assert resp.status_code == 200
    data = resp.json()
    assert data["completed_at"] is not None
    assert data["completed_by"] == regular_user.id

    card.refresh_from_db()
    assert card.completed_at is not None
    assert card.completed_by_id == regular_user.id


@pytest.mark.django_db()
def test_any_user_can_complete_a_card_assigned_to_someone_else(column: Column) -> None:
    assignee = User.objects.create_user(username="mike", password="pass")
    completer = User.objects.create_user(username="lisa", password="pass")
    card = Card.objects.create(column=column, title="Buy milk", assignee=assignee)

    client = _client_for(completer)
    resp = client.post(f"/api/v1/cards/{card.id}/complete/")

    assert resp.status_code == 200
    card.refresh_from_db()
    assert card.completed_by_id == completer.id
    assert card.assignee_id == assignee.id


@pytest.mark.django_db()
def test_complete_card_writes_activity_log_entry(regular_user: User, card: Card) -> None:
    client = _client_for(regular_user)

    client.post(f"/api/v1/cards/{card.id}/complete/")

    activity = CardActivity.objects.filter(card=card, action="card.updated").latest("created_at")
    assert activity.actor_id == regular_user.id
    assert activity.before.get("completed_at") is None
    assert activity.after.get("completed_at") is not None


@pytest.mark.django_db()
def test_complete_card_creates_completed_notification_event(regular_user: User, card: Card) -> None:
    client = _client_for(regular_user)

    client.post(f"/api/v1/cards/{card.id}/complete/")

    assert NotificationEvent.objects.filter(event_type="card.completed", card_id=card.id).exists()


# ---------------------------------------------------------------------------
# Uncomplete
# ---------------------------------------------------------------------------


@pytest.mark.django_db()
def test_uncomplete_card_clears_moment_and_actor(regular_user: User, card: Card) -> None:
    client = _client_for(regular_user)
    client.post(f"/api/v1/cards/{card.id}/complete/")

    resp = client.post(f"/api/v1/cards/{card.id}/uncomplete/")

    assert resp.status_code == 200
    data = resp.json()
    assert data["completed_at"] is None
    assert data["completed_by"] is None

    card.refresh_from_db()
    assert card.completed_at is None
    assert card.completed_by_id is None


# ---------------------------------------------------------------------------
# Subtask cascade
# ---------------------------------------------------------------------------


@pytest.mark.django_db()
def test_completing_parent_cascades_to_open_subtasks(regular_user: User, column: Column) -> None:
    parent = Card.objects.create(column=column, title="Trip")
    sub1 = Card.objects.create(column=column, title="Book flights", parent=parent)
    sub2 = Card.objects.create(column=column, title="Book hotel", parent=parent)
    sub1_version = sub1.version

    client = _client_for(regular_user)
    client.post(f"/api/v1/cards/{parent.id}/complete/")

    sub1.refresh_from_db()
    sub2.refresh_from_db()
    parent.refresh_from_db()
    assert sub1.completed_at == parent.completed_at
    assert sub1.completed_by_id == regular_user.id
    assert sub2.completed_at == parent.completed_at
    assert sub2.completed_by_id == regular_user.id
    # The cascade goes through a bulk update, not save() — version/updated_at
    # must still advance so optimistic concurrency stays meaningful for subtasks.
    assert sub1.version == sub1_version + 1


@pytest.mark.django_db()
def test_completing_parent_writes_activity_log_for_cascaded_subtasks(
    regular_user: User, column: Column
) -> None:
    parent = Card.objects.create(column=column, title="Trip")
    sub = Card.objects.create(column=column, title="Book flights", parent=parent)

    _client_for(regular_user).post(f"/api/v1/cards/{parent.id}/complete/")

    activity = CardActivity.objects.filter(card=sub, action="card.updated").latest("created_at")
    assert activity.actor_id == regular_user.id
    assert activity.before.get("completed_at") is None
    assert activity.after.get("completed_at") is not None


@pytest.mark.django_db()
def test_completing_parent_does_not_touch_already_completed_subtask(
    regular_user: User, column: Column
) -> None:
    other = User.objects.create_user(username="other", password="pass")
    parent = Card.objects.create(column=column, title="Trip")
    completed_sub = Card.objects.create(
        column=column,
        title="Already done",
        parent=parent,
    )
    client = _client_for(other)
    client.post(f"/api/v1/cards/{completed_sub.id}/complete/")
    completed_sub.refresh_from_db()
    original_completed_at = completed_sub.completed_at

    _client_for(regular_user).post(f"/api/v1/cards/{parent.id}/complete/")

    completed_sub.refresh_from_db()
    assert completed_sub.completed_at == original_completed_at
    assert completed_sub.completed_by_id == other.id


@pytest.mark.django_db()
def test_uncompleting_parent_does_not_reopen_subtasks(regular_user: User, column: Column) -> None:
    parent = Card.objects.create(column=column, title="Trip")
    sub = Card.objects.create(column=column, title="Book flights", parent=parent)
    client = _client_for(regular_user)
    client.post(f"/api/v1/cards/{parent.id}/complete/")
    sub.refresh_from_db()
    assert sub.completed_at is not None

    client.post(f"/api/v1/cards/{parent.id}/uncomplete/")

    parent.refresh_from_db()
    sub.refresh_from_db()
    assert parent.completed_at is None
    assert sub.completed_at is not None


@pytest.mark.django_db()
def test_completing_all_subtasks_does_not_complete_parent(
    regular_user: User, column: Column
) -> None:
    parent = Card.objects.create(column=column, title="Trip")
    sub = Card.objects.create(column=column, title="Book flights", parent=parent)
    client = _client_for(regular_user)

    client.post(f"/api/v1/cards/{sub.id}/complete/")

    parent.refresh_from_db()
    assert parent.completed_at is None


# ---------------------------------------------------------------------------
# Vocabulary change: card.moved is no longer a notification event type
# ---------------------------------------------------------------------------


@pytest.mark.django_db()
def test_moving_a_card_no_longer_creates_a_notification_event(api_client: APIClient) -> None:
    board = Board.objects.create(name="B")
    col1 = Column.objects.create(board=board, name="Todo")
    col2 = Column.objects.create(board=board, name="Done")
    card = Card.objects.create(column=col1, title="Mover")

    api_client.post(
        f"/api/v1/cards/{card.id}/move/",
        data={"to_column": col2.id},
        format="json",
    )

    assert not NotificationEvent.objects.filter(event_type="card.moved", card_id=card.id).exists()


@pytest.mark.django_db()
def test_backfill_migration_deletes_stale_preferences_for_removed_event_types(
    regular_user: User,
) -> None:
    import importlib

    from django.apps import apps as live_apps

    from kanban.models import NotificationPreference

    kept = NotificationPreference.objects.create(
        user=regular_user, channel="email", event_type="card.completed"
    )
    stale = NotificationPreference.objects.create(
        user=regular_user, channel="email", event_type="card.moved"
    )

    migration_module = importlib.import_module(
        "kanban.migrations.0050_notification_event_vocabulary"
    )
    migration_module.delete_stale_preferences(live_apps, None)

    assert NotificationPreference.objects.filter(pk=kept.pk).exists()
    assert not NotificationPreference.objects.filter(pk=stale.pk).exists()
