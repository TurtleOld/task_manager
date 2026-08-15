from __future__ import annotations

from datetime import timedelta

import pytest
from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework.test import APIClient

from kanban.models import Board, Card, CardActivity, Column

User = get_user_model()

# ---------------------------------------------------------------------------
# Model
# ---------------------------------------------------------------------------


@pytest.mark.django_db()
def test_card_completion_fields_default_to_unset(card: Card) -> None:
    assert card.completed_at is None
    assert card.completed_by_id is None


@pytest.mark.django_db()
def test_deleting_completed_by_user_keeps_the_card(column: Column) -> None:
    completer = User.objects.create_user(username="completer", password="pass")
    card = Card.objects.create(
        column=column,
        title="Buy milk",
        completed_at=timezone.now(),
        completed_by=completer,
    )

    completer.delete()
    card.refresh_from_db()

    assert Card.objects.filter(pk=card.pk).exists()
    assert card.completed_by_id is None
    assert card.completed_at is not None


# ---------------------------------------------------------------------------
# Serializer / API
# ---------------------------------------------------------------------------


@pytest.mark.django_db()
def test_completion_fields_are_readable_via_api(api_client: APIClient, column: Column) -> None:
    completer = User.objects.create_user(username="lisa", password="pass", first_name="Lisa")
    completed_at = timezone.now()
    card = Card.objects.create(
        column=column,
        title="Buy milk",
        completed_at=completed_at,
        completed_by=completer,
    )

    resp = api_client.get(f"/api/v1/cards/{card.id}/")

    assert resp.status_code == 200
    data = resp.json()
    assert data["completed_at"] is not None
    assert data["completed_by"] == completer.id


@pytest.mark.django_db()
def test_completion_fields_cannot_be_set_via_api(api_client: APIClient, column: Column) -> None:
    completer = User.objects.create_user(username="mike", password="pass")
    resp = api_client.post(
        "/api/v1/cards/",
        data={
            "column": column.id,
            "title": "New task",
            "completed_at": timezone.now().isoformat(),
            "completed_by": completer.id,
        },
        format="json",
    )

    assert resp.status_code == 201
    card = Card.objects.get(pk=resp.json()["id"])
    assert card.completed_at is None
    assert card.completed_by_id is None


# ---------------------------------------------------------------------------
# Migration backfill
# ---------------------------------------------------------------------------


def _run_backfill(apps: object | None = None) -> None:
    import importlib

    from django.apps import apps as live_apps

    backfill_module = importlib.import_module(
        "kanban.migrations.0049_backfill_completion_fields"
    )
    backfill_module.backfill_completion_fields(apps or live_apps, None)


@pytest.mark.django_db()
def test_backfill_restores_author_and_moment_from_activity_log(board: Board) -> None:
    todo = Column.objects.create(board=board, name="To Do", is_done=False)
    done = Column.objects.create(board=board, name="Done", is_done=True)
    author = User.objects.create_user(username="lisa", password="pass")

    card = Card.objects.create(column=todo, title="Buy milk")
    card._activity_actor = author
    card.column = done
    card.save()

    move_activity = CardActivity.objects.get(
        card=card, action="card.updated", after__column=done.id
    )

    # A later, unrelated activity record should not override the move record.
    CardActivity.objects.create(
        card=card,
        actor=None,
        action="card.updated",
        before={"title": "Buy milk"},
        after={"title": "Buy milk (urgent)"},
        created_at=timezone.now() + timedelta(hours=1),
    )

    _run_backfill()

    card.refresh_from_db()
    assert card.completed_by_id == author.id
    assert card.completed_at == move_activity.created_at


@pytest.mark.django_db()
def test_backfill_falls_back_to_updated_at_without_activity_record(board: Board) -> None:
    done = Column.objects.create(board=board, name="Done", is_done=True)
    card = Card.objects.create(column=done, title="Buy milk")

    _run_backfill()

    card.refresh_from_db()
    assert card.completed_by_id is None
    assert card.completed_at == card.updated_at


@pytest.mark.django_db()
def test_backfill_leaves_cards_in_other_columns_uncompleted(board: Board) -> None:
    todo = Column.objects.create(board=board, name="To Do", is_done=False)
    card = Card.objects.create(column=todo, title="Buy milk")

    _run_backfill()

    card.refresh_from_db()
    assert card.completed_at is None
    assert card.completed_by_id is None
