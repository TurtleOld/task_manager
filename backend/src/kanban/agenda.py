from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from django.db.models import Count, Exists, F, OuterRef, Q, QuerySet
from django.utils import timezone as dj_timezone

from .models import Card, ChecklistItem, RecurrenceRule


@dataclass(frozen=True)
class AgendaBoundaries:
    """Group boundaries for one user, computed in their timezone.

    The client buckets cards into groups using these — the server never
    computes or returns a group, only the flat card list and the rules to
    bucket it (see docs/spec/agenda.md §4).
    """

    timezone: str
    today_start: datetime
    tomorrow_start: datetime
    day_after_start: datetime
    week_end: datetime

    def as_dict(self) -> dict[str, str]:
        return {
            "timezone": self.timezone,
            "today_start": self.today_start.isoformat(),
            "tomorrow_start": self.tomorrow_start.isoformat(),
            "day_after_start": self.day_after_start.isoformat(),
            "week_end": self.week_end.isoformat(),
        }


def resolve_timezone(tz_name: str) -> ZoneInfo:
    try:
        return ZoneInfo(tz_name or "UTC")
    except Exception:  # noqa: BLE001
        return ZoneInfo("UTC")


def compute_agenda_boundaries(*, now: datetime, tz_name: str) -> AgendaBoundaries:
    tz = resolve_timezone(tz_name)
    local_now = dj_timezone.localtime(now, tz)
    today_start = local_now.replace(hour=0, minute=0, second=0, microsecond=0)
    tomorrow_start = today_start + timedelta(days=1)
    day_after_start = today_start + timedelta(days=2)

    # Calendar week runs Monday..Sunday. week_end is the start of the *next*
    # Monday — even when today already is Monday, since that Monday started
    # the current week rather than ending it. Sat/Sun therefore end up with
    # day_after_start >= week_end, which is what makes "На этой неделе" come
    # up empty on weekends (see docs/spec/agenda.md §3.1) — no special-casing
    # needed here, it falls out of the arithmetic.
    weekday = today_start.weekday()  # Monday=0 ... Sunday=6
    days_to_next_monday = 7 - weekday if weekday else 7
    week_end = today_start + timedelta(days=days_to_next_monday)

    return AgendaBoundaries(
        timezone=tz_name or "UTC",
        today_start=today_start,
        tomorrow_start=tomorrow_start,
        day_after_start=day_after_start,
        week_end=week_end,
    )


def agenda_queryset(
    *,
    boundaries: AgendaBoundaries,
    board_id: int | None = None,
    assignee_id: int | None = None,
) -> QuerySet[Card]:
    queryset = (
        Card.objects.select_related("board", "assignee", "completed_by")
        .filter(parent__isnull=True)
        .filter(
            Q(completed_at__isnull=True)
            | Q(
                completed_at__gte=boundaries.today_start,
                completed_at__lt=boundaries.tomorrow_start,
            )
        )
        .annotate(
            has_subtasks=Exists(Card.objects.filter(parent_id=OuterRef("pk"))),
            has_checklist=Exists(ChecklistItem.objects.filter(card_id=OuterRef("pk"))),
            is_recurring=Exists(RecurrenceRule.objects.filter(card_id=OuterRef("pk"))),
            checklist_total=Count("checklist_items", distinct=True),
            checklist_completed=Count(
                "checklist_items", filter=Q(checklist_items__done=True), distinct=True
            ),
        )
    )

    if board_id is not None:
        queryset = queryset.filter(board_id=board_id)
    if assignee_id is not None:
        queryset = queryset.filter(assignee_id=assignee_id)

    return queryset.order_by(F("deadline").asc(nulls_last=True), "-priority", "created_at")


@dataclass(frozen=True)
class FamilyTodayPerson:
    """Family-wide, never scoped to the currently selected list."""

    user_id: int
    username: str
    full_name: str
    today_total: int
    today_completed: int


def family_today_people(*, boundaries: AgendaBoundaries) -> list[FamilyTodayPerson]:
    rows = (
        Card.objects.filter(
            archived_at__isnull=True,
            assignee__isnull=False,
            deadline__gte=boundaries.today_start,
            deadline__lt=boundaries.tomorrow_start,
        )
        .values("assignee_id", "assignee__username", "assignee__first_name")
        .annotate(
            today_total=Count("id"),
            today_completed=Count("id", filter=Q(completed_at__isnull=False)),
        )
        .order_by("assignee__first_name", "assignee__username")
    )
    return [
        FamilyTodayPerson(
            user_id=row["assignee_id"],
            username=row["assignee__username"],
            full_name=row["assignee__first_name"],
            today_total=row["today_total"],
            today_completed=row["today_completed"],
        )
        for row in rows
    ]


def week_start_of(boundaries: AgendaBoundaries) -> datetime:
    weekday = boundaries.today_start.weekday()
    return boundaries.today_start - timedelta(days=weekday)


def family_week_progress(*, boundaries: AgendaBoundaries) -> tuple[int, int]:
    """(completed, total) for the current calendar week.

    `total` counts cards *due* this week, whether or not they're done yet —
    the family's plan for the week. `completed` counts by completion moment
    per docs/spec/agenda.md §3.2, so a task finished early or one due a
    different week still counts the moment it's checked off. Archived tasks
    never count either way: archive means "no longer needed", not "done".
    """
    week_start = week_start_of(boundaries)
    total = Card.objects.filter(
        archived_at__isnull=True,
        deadline__gte=week_start,
        deadline__lt=boundaries.week_end,
    ).count()
    completed = Card.objects.filter(
        archived_at__isnull=True,
        completed_at__gte=week_start,
        completed_at__lt=boundaries.week_end,
    ).count()
    return completed, total


def shopping_list_card() -> Card | None:
    return Card.objects.filter(is_shopping_list=True).select_related("board").first()
