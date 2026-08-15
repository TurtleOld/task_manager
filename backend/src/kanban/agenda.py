from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from django.db.models import Exists, F, OuterRef, Q, QuerySet
from django.utils import timezone as dj_timezone

from .models import Card, ChecklistItem


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
        )
    )

    if board_id is not None:
        queryset = queryset.filter(board_id=board_id)
    if assignee_id is not None:
        queryset = queryset.filter(assignee_id=assignee_id)

    return queryset.order_by(F("deadline").asc(nulls_last=True), "-priority", "created_at")
