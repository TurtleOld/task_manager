from __future__ import annotations

from datetime import timedelta

import pytest
from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework.test import APIClient

from kanban.agenda import compute_agenda_boundaries, shopping_list_card
from kanban.models import (
    Board,
    Card,
    Column,
    NotificationEvent,
    RecurrenceFrequency,
    RecurrenceRule,
)
from kanban.tasks import generate_recurring_cards, send_overdue_card_reminders

User = get_user_model()


def _archive_board(board: Board) -> None:
    board.archived_at = timezone.now()
    board.save(update_fields=["archived_at", "updated_at", "version"])


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


@pytest.mark.django_db()
def test_active_cards_hide_tasks_of_archived_list() -> None:
    board = Board.objects.create(name="Home")
    column = Column.objects.create(board=board, name="To Do")
    card = Card.objects.create(column=column, title="Buy tickets")

    _archive_board(board)

    assert list(Card.objects.filter(id=card.id)) == []
    assert list(Card.with_archived.filter(id=card.id)) == [card]


@pytest.mark.django_db()
def test_agenda_all_lists_and_list_scope_exclude_archived_list(
    auth_client: APIClient,
) -> None:
    board = Board.objects.create(name="Vacation 2025")
    column = Column.objects.create(board=board, name="To Do")
    card = Card.objects.create(
        column=column, title="Buy tickets", deadline=timezone.now()
    )

    visible = auth_client.get("/api/v1/agenda/").json()["cards"]
    assert card.id in [item["id"] for item in visible]

    _archive_board(board)

    assert auth_client.get("/api/v1/agenda/").json()["cards"] == []
    scoped = auth_client.get(f"/api/v1/agenda/?list={board.id}").json()["cards"]
    assert scoped == []


@pytest.mark.django_db()
def test_completed_agenda_excludes_archived_list(auth_client: APIClient) -> None:
    board = Board.objects.create(name="Vacation")
    column = Column.objects.create(board=board, name="To Do")
    card = Card.objects.create(
        column=column, title="Buy tickets", completed_at=timezone.now()
    )

    before = auth_client.get("/api/v1/agenda/completed/").json()["cards"]
    assert card.id in [item["id"] for item in before]

    _archive_board(board)

    assert auth_client.get("/api/v1/agenda/completed/").json()["cards"] == []


@pytest.mark.django_db()
def test_family_today_excludes_archived_list(
    auth_client: APIClient, regular_user: User
) -> None:
    boundaries = compute_agenda_boundaries(now=timezone.now(), tz_name="UTC")
    board = Board.objects.create(name="Vacation")
    column = Column.objects.create(board=board, name="To Do")
    Card.objects.create(
        column=column,
        title="Buy tickets",
        assignee=regular_user,
        deadline=boundaries.today_start,
    )

    before = auth_client.get("/api/v1/agenda/family-today/").json()
    assert regular_user.id in {p["user"]["id"] for p in before["people"]}
    assert before["week"]["total"] == 1

    _archive_board(board)

    after = auth_client.get("/api/v1/agenda/family-today/").json()
    assert regular_user.id not in {p["user"]["id"] for p in after["people"]}
    assert after["week"]["total"] == 0


@pytest.mark.django_db()
def test_shopping_list_ignores_card_on_archived_list() -> None:
    board = Board.objects.create(name="Vacation")
    column = Column.objects.create(board=board, name="To Do")
    card = Card.objects.create(
        column=column, title="Покупки", is_shopping_list=True
    )

    assert shopping_list_card() == card

    _archive_board(board)

    assert shopping_list_card() is None


@pytest.mark.django_db()
def test_overdue_reminders_skip_tasks_of_archived_list(webpush_settings) -> None:
    board = Board.objects.create(name="Vacation")
    column = Column.objects.create(board=board, name="To Do")
    Card.objects.create(
        column=column,
        title="Buy tickets",
        deadline=timezone.now() - timedelta(hours=1),
    )

    _archive_board(board)

    send_overdue_card_reminders.run()

    overdue = NotificationEvent.objects.filter(
        dedupe_key__startswith="card.overdue:"
    )
    assert list(overdue) == []


@pytest.mark.django_db()
def test_search_hides_tasks_of_archived_list(auth_client: APIClient) -> None:
    board = Board.objects.create(name="Vacation")
    column = Column.objects.create(board=board, name="To Do")
    Card.objects.create(column=column, title="Buy tickets")

    assert auth_client.get("/api/v1/search/?q=tickets").json()["cards"]

    _archive_board(board)

    assert auth_client.get("/api/v1/search/?q=tickets").json()["cards"] == []


@pytest.mark.django_db()
def test_recurrence_does_not_generate_on_archived_list(column: Column) -> None:
    now = timezone.now()
    card = Card.objects.create(
        column=column,
        title="Recurring",
        deadline=now - timedelta(minutes=1),
        completed_at=now,
    )
    rule = RecurrenceRule.objects.create(
        card=card,
        freq=RecurrenceFrequency.DAILY,
        interval=1,
        next_due=now - timedelta(minutes=1),
    )

    _archive_board(column.board)

    generate_recurring_cards()

    assert Card.with_archived.filter(parent_recurrence=rule).count() == 0
    rule.refresh_from_db()
    assert rule.generated_count == 0


@pytest.mark.django_db()
def test_task_of_archived_list_is_still_reachable_by_id(
    auth_client: APIClient,
) -> None:
    board = Board.objects.create(name="Vacation")
    column = Column.objects.create(board=board, name="To Do")
    card = Card.objects.create(column=column, title="Buy tickets")

    _archive_board(board)

    resp = auth_client.get(f"/api/v1/cards/{card.id}/")

    assert resp.status_code == 200
    assert resp.json()["id"] == card.id

