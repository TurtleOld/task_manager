from __future__ import annotations

from datetime import datetime, timedelta
from datetime import timezone as dt_timezone

import pytest
from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework.test import APIClient

from kanban.agenda import compute_agenda_boundaries
from kanban.models import Card, ChecklistItem, Column, NotificationProfile

User = get_user_model()


# ---------------------------------------------------------------------------
# compute_agenda_boundaries — pure function, no DB/HTTP involved
# ---------------------------------------------------------------------------


def _at(year: int, month: int, day: int, hour: int = 12) -> datetime:
    return datetime(year, month, day, hour, tzinfo=dt_timezone.utc)


def test_boundaries_span_a_single_local_day() -> None:
    boundaries = compute_agenda_boundaries(now=_at(2026, 8, 12), tz_name="UTC")

    assert boundaries.today_start.isoformat() == "2026-08-12T00:00:00+00:00"
    assert boundaries.tomorrow_start.isoformat() == "2026-08-13T00:00:00+00:00"
    assert boundaries.day_after_start.isoformat() == "2026-08-14T00:00:00+00:00"


def test_boundaries_shift_at_the_day_boundary_in_user_timezone() -> None:
    # UTC 23:30 on 2026-08-11 is already 2026-08-12 in Moscow (UTC+3).
    now = datetime(2026, 8, 11, 23, 30, tzinfo=dt_timezone.utc)
    boundaries = compute_agenda_boundaries(now=now, tz_name="Europe/Moscow")

    assert boundaries.today_start.isoformat() == "2026-08-12T00:00:00+03:00"


def test_boundaries_use_the_requested_timezone_offset() -> None:
    now = _at(2026, 8, 12, hour=10)

    moscow = compute_agenda_boundaries(now=now, tz_name="Europe/Moscow")
    tokyo = compute_agenda_boundaries(now=now, tz_name="Asia/Tokyo")

    assert moscow.today_start.isoformat() == "2026-08-12T00:00:00+03:00"
    assert tokyo.today_start.isoformat() == "2026-08-12T00:00:00+09:00"


def test_unknown_timezone_falls_back_to_utc() -> None:
    boundaries = compute_agenda_boundaries(now=_at(2026, 8, 12), tz_name="Not/A_Zone")
    assert boundaries.timezone == "Not/A_Zone"
    assert boundaries.today_start.isoformat() == "2026-08-12T00:00:00+00:00"


@pytest.mark.parametrize(
    ("date", "expected_week_end"),
    [
        # Wednesday 2026-08-12 -> next Monday is 2026-08-17
        ((2026, 8, 12), "2026-08-17T00:00:00+00:00"),
        # Monday itself -> the *next* Monday, a full week away, not today
        ((2026, 8, 10), "2026-08-17T00:00:00+00:00"),
        # Sunday -> tomorrow (Monday)
        ((2026, 8, 16), "2026-08-17T00:00:00+00:00"),
        # Saturday -> day-after-tomorrow (Monday), same instant as day_after_start
        ((2026, 8, 15), "2026-08-17T00:00:00+00:00"),
    ],
)
def test_week_end_is_the_start_of_the_next_monday(
    date: tuple[int, int, int], expected_week_end: str
) -> None:
    boundaries = compute_agenda_boundaries(now=_at(*date), tz_name="UTC")
    assert boundaries.week_end.isoformat() == expected_week_end


def test_weekend_leaves_this_week_empty() -> None:
    # Saturday: day_after_start and week_end coincide, so
    # [day_after_start, week_end) — "На этой неделе" — is empty.
    saturday = compute_agenda_boundaries(now=_at(2026, 8, 15), tz_name="UTC")
    assert saturday.day_after_start == saturday.week_end


def test_sunday_deadline_falls_within_this_week_from_a_weekday() -> None:
    # Viewed from Wednesday: a Sunday deadline is within [day_after_start, week_end).
    boundaries = compute_agenda_boundaries(now=_at(2026, 8, 12), tz_name="UTC")
    sunday_deadline = _at(2026, 8, 16)
    next_monday_deadline = _at(2026, 8, 17)

    assert boundaries.day_after_start <= sunday_deadline < boundaries.week_end
    assert next_monday_deadline >= boundaries.week_end


# ---------------------------------------------------------------------------
# GET /agenda/
# ---------------------------------------------------------------------------


@pytest.mark.django_db()
def test_agenda_requires_authentication() -> None:
    resp = APIClient().get("/api/v1/agenda/")
    assert resp.status_code == 401


@pytest.mark.django_db()
def test_agenda_reports_boundaries_in_the_caller_timezone(
    regular_user: User, auth_client: APIClient
) -> None:
    NotificationProfile.objects.update_or_create(
        user=regular_user, defaults={"timezone": "Europe/Moscow"}
    )
    resp = auth_client.get("/api/v1/agenda/")

    assert resp.status_code == 200
    boundaries = resp.json()["boundaries"]
    assert boundaries["timezone"] == "Europe/Moscow"
    assert set(boundaries) == {
        "timezone",
        "today_start",
        "tomorrow_start",
        "day_after_start",
        "week_end",
    }


@pytest.mark.django_db()
def test_agenda_defaults_to_utc_when_no_profile_exists(auth_client: APIClient) -> None:
    resp = auth_client.get("/api/v1/agenda/")

    assert resp.status_code == 200
    assert resp.json()["boundaries"]["timezone"] == "UTC"


@pytest.mark.django_db()
def test_agenda_lists_a_task_with_no_deadline(auth_client: APIClient, column: Column) -> None:
    Card.objects.create(column=column, title="Someday task", deadline=None)

    resp = auth_client.get("/api/v1/agenda/")

    titles = [item["title"] for item in resp.json()["cards"]]
    assert "Someday task" in titles


@pytest.mark.django_db()
def test_agenda_excludes_archived_tasks(auth_client: APIClient, column: Column) -> None:
    Card.objects.create(column=column, title="Archived", archived_at=timezone.now())
    Card.objects.create(column=column, title="Active")

    resp = auth_client.get("/api/v1/agenda/")

    titles = [item["title"] for item in resp.json()["cards"]]
    assert "Archived" not in titles
    assert "Active" in titles


@pytest.mark.django_db()
def test_agenda_filters_by_list(auth_client: APIClient, column: Column) -> None:
    from kanban.models import Board

    other_board = Board.objects.create(name="Other list")
    other_column = Column.objects.create(board=other_board, name="To Do")
    Card.objects.create(column=column, title="In target list")
    Card.objects.create(column=other_column, title="In other list")

    resp = auth_client.get(f"/api/v1/agenda/?list={column.board_id}")

    titles = [item["title"] for item in resp.json()["cards"]]
    assert titles == ["In target list"]


@pytest.mark.django_db()
def test_agenda_filters_by_assignee(
    regular_user: User, auth_client: APIClient, column: Column
) -> None:
    other_user = User.objects.create_user(username="other", password="pass")
    Card.objects.create(column=column, title="Mine", assignee=regular_user)
    Card.objects.create(column=column, title="Theirs", assignee=other_user)

    resp = auth_client.get(f"/api/v1/agenda/?assignee={regular_user.id}")

    titles = [item["title"] for item in resp.json()["cards"]]
    assert titles == ["Mine"]


@pytest.mark.django_db()
def test_agenda_returns_a_task_completed_today(auth_client: APIClient, column: Column) -> None:
    boundaries = compute_agenda_boundaries(now=timezone.now(), tz_name="UTC")
    completer = User.objects.create_user(username="completer", password="pass")
    card = Card.objects.create(column=column, title="Done today")
    card.completed_at = boundaries.today_start + timedelta(hours=1)
    card.completed_by = completer
    card.save(update_fields=["completed_at", "completed_by"])

    resp = auth_client.get("/api/v1/agenda/")

    data = resp.json()["cards"]
    item = next(entry for entry in data if entry["title"] == "Done today")
    assert item["completed_at"] is not None
    assert item["completed_by"]["id"] == completer.id


@pytest.mark.django_db()
def test_agenda_drops_a_task_completed_before_today(auth_client: APIClient, column: Column) -> None:
    boundaries = compute_agenda_boundaries(now=timezone.now(), tz_name="UTC")
    card = Card.objects.create(column=column, title="Done yesterday")
    card.completed_at = boundaries.today_start - timedelta(minutes=1)
    card.save(update_fields=["completed_at"])

    resp = auth_client.get("/api/v1/agenda/")

    titles = [item["title"] for item in resp.json()["cards"]]
    assert "Done yesterday" not in titles


@pytest.mark.django_db()
def test_agenda_card_carries_row_fields(
    regular_user: User, auth_client: APIClient, column: Column
) -> None:
    from kanban.models import CardPriority

    card = Card.objects.create(
        column=column,
        title="Full row",
        assignee=regular_user,
        priority=CardPriority.HIGH,
        deadline=timezone.now() + timedelta(days=1),
    )
    Card.objects.create(column=column, title="Sub", parent=card)
    ChecklistItem.objects.create(card=card, text="Milk")

    resp = auth_client.get("/api/v1/agenda/")

    item = next(entry for entry in resp.json()["cards"] if entry["title"] == "Full row")
    assert item["list"] == column.board_id
    assert item["deadline"] is not None
    assert item["priority"] == CardPriority.HIGH
    assert item["assignee"]["id"] == regular_user.id
    assert item["has_subtasks"] is True
    assert item["has_checklist"] is True


@pytest.mark.django_db()
def test_agenda_omits_subtasks_as_top_level_rows(auth_client: APIClient, column: Column) -> None:
    parent = Card.objects.create(column=column, title="Parent")
    Card.objects.create(column=column, title="Child", parent=parent)

    resp = auth_client.get("/api/v1/agenda/")

    titles = [item["title"] for item in resp.json()["cards"]]
    assert titles == ["Parent"]


@pytest.mark.django_db()
def test_agenda_orders_by_deadline_then_priority_then_created_at(
    auth_client: APIClient, column: Column
) -> None:
    from kanban.models import CardPriority

    now = timezone.now()
    same_deadline = now + timedelta(days=3)

    Card.objects.create(
        column=column,
        title="Low, created first",
        deadline=same_deadline,
        priority=CardPriority.LOW,
    )
    Card.objects.create(
        column=column,
        title="High, created second",
        deadline=same_deadline,
        priority=CardPriority.HIGH,
    )
    Card.objects.create(column=column, title="No deadline")
    Card.objects.create(
        column=column,
        title="Earliest deadline",
        deadline=now + timedelta(hours=1),
    )

    resp = auth_client.get("/api/v1/agenda/")

    titles = [item["title"] for item in resp.json()["cards"]]
    assert titles == [
        "Earliest deadline",
        "High, created second",
        "Low, created first",
        "No deadline",
    ]
