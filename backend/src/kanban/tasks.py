from __future__ import annotations

import calendar
from datetime import datetime
from zoneinfo import ZoneInfo

from celery import shared_task
from django.conf import settings
from django.db import transaction
from django.utils import timezone

from .models import (
    Attachment,
    Card,
    CardActivity,
    NotificationEventType,
    NotificationProfile,
    RecurrenceFrequency,
    RecurrenceRule,
    SiteSettings,
)


def calculate_next_recurrence_due(
    *,
    base: datetime,
    freq: str,
    interval: int = 1,
    byweekday: list[int] | None = None,
    byday: int | None = None,
    bysetpos: int | None = None,
) -> datetime:
    interval = max(1, int(interval or 1))
    byweekday = sorted(set(int(day) for day in (byweekday or []) if 0 <= int(day) <= 6))

    if freq == RecurrenceFrequency.DAILY:
        return base + timezone.timedelta(days=interval)

    if freq == RecurrenceFrequency.WEEKLY:
        if byweekday:
            for offset in range(1, 8 * interval + 1):
                candidate = base + timezone.timedelta(days=offset)
                if candidate.weekday() in byweekday:
                    return candidate
        return base + timezone.timedelta(weeks=interval)

    if freq == RecurrenceFrequency.MONTHLY:
        if bysetpos is not None and byweekday:
            return _nth_weekday_of_month(base, interval, byweekday[0], bysetpos)
        return _add_months(base, interval, byday or base.day)

    if freq == RecurrenceFrequency.YEARLY:
        return _add_months(base, 12 * interval, byday or base.day)

    return base + timezone.timedelta(days=interval)


def _add_months(value: datetime, months: int, day: int) -> datetime:
    month_index = value.month - 1 + months
    year = value.year + month_index // 12
    month = month_index % 12 + 1
    max_day = calendar.monthrange(year, month)[1]
    return value.replace(year=year, month=month, day=min(day, max_day))


def _nth_weekday_of_month(base: datetime, months: int, weekday: int, pos: int) -> datetime:
    """Return the pos-th occurrence of weekday in the target month (pos<0 counts from end)."""
    month_index = base.month - 1 + months
    year = base.year + month_index // 12
    month = month_index % 12 + 1
    max_day = calendar.monthrange(year, month)[1]

    # Collect all days in that month matching the weekday (0=Mon … 6=Sun)
    days = [
        d
        for d in range(1, max_day + 1)
        if base.replace(year=year, month=month, day=d).weekday() == weekday
    ]
    if not days:
        return _add_months(base, months, base.day)

    # pos is 1-based; negative counts from end (-1 = last)
    try:
        target_day = days[pos - 1] if pos > 0 else days[pos]
    except IndexError:
        target_day = days[-1]

    return base.replace(year=year, month=month, day=target_day)


def _ru_plural(value: int, forms: tuple[str, str, str]) -> str:
    # forms: (one, few, many) e.g. ("минута", "минуты", "минут")
    n = abs(int(value))
    if n % 10 == 1 and n % 100 != 11:
        return forms[0]
    if 2 <= n % 10 <= 4 and not (12 <= n % 100 <= 14):
        return forms[1]
    return forms[2]


def _format_offset_ru(*, value: int, unit: str) -> str:
    if unit == "hours":
        word = _ru_plural(value, ("час", "часа", "часов"))
        return f"за {value} {word} до срока"
    word = _ru_plural(value, ("минуту", "минуты", "минут"))
    return f"за {value} {word} до срока"


def _format_deadline_ru(*, dt: datetime, tz_name: str) -> str:
    try:
        tz = ZoneInfo(tz_name or "UTC")
    except Exception:  # noqa: BLE001
        tz = ZoneInfo("UTC")
    local = timezone.localtime(dt, tz)
    return local.strftime("%d.%m.%Y %H:%M")


def _build_card_link(*, card: Card) -> str:
    base = settings.FRONTEND_BASE_URL.rstrip("/")
    return f"{base}/lists/{card.board_id}/tasks/{card.id}"


@shared_task(bind=True, max_retries=2, default_retry_delay=30)
def generate_recurring_cards(self) -> None:
    now = timezone.now()
    # Only IDs here — the actual row is re-fetched under lock per rule, since
    # a concurrent run (overlapping beat ticks, two workers) may have already
    # handled it by the time we get to it.
    rule_ids = list(
        RecurrenceRule.objects.filter(next_due__isnull=False, next_due__lte=now)
        .order_by("next_due", "id")
        .values_list("id", flat=True)
    )

    for rule_id in rule_ids:
        _generate_recurring_card_for_rule(rule_id=rule_id, now=now)


def _generate_recurring_card_for_rule(*, rule_id: int, now: datetime) -> None:
    with transaction.atomic():
        # `card__assignee` is a nullable FK, so `select_related` compiles to a
        # LEFT OUTER JOIN, and Postgres refuses `FOR UPDATE` on its nullable
        # side. Without `of=("self",)` the whole job raises on every
        # maintenance tick and no rule is ever processed.
        rule = (
            RecurrenceRule.objects.select_for_update(
                skip_locked=True, of=("self",)
            )
            .select_related("card", "card__column", "card__board", "card__assignee")
            .filter(id=rule_id)
            .first()
        )
        # Locked by a concurrent run, or deleted since we listed it.
        if rule is None:
            return
        # A concurrent run already advanced/cleared this rule.
        if rule.next_due is None or rule.next_due > now:
            return

        card = rule.card
        if card.archived_at is not None or card.column.archived_at is not None:
            return
        if rule.until is not None and rule.next_due.date() > rule.until:
            return
        if rule.count is not None and rule.generated_count >= rule.count:
            return

        due = rule.next_due

        # At most one open instance (not completed, not archived) per recurrence
        # series. The series' current card always owns the only "live" rule
        # (generation transfers next_due to the new copy's own rule and clears
        # it here), so checking this card is enough — no need to walk the
        # chain. Held silently: no card is created, no notification, no
        # indicator; only the due date shifts so the check is cheap next time.
        if card.completed_at is None and card.archived_at is None:
            rule.next_due = calculate_next_recurrence_due(
                base=due,
                freq=rule.freq,
                interval=rule.interval,
                byweekday=rule.byweekday,
                byday=rule.byday,
                bysetpos=rule.bysetpos,
            )
            rule.save(update_fields=["next_due", "updated_at", "version"])
            return

        # The copy's deadline is the NEXT occurrence after the trigger time.
        # This guarantees the generated task always starts with a future deadline.
        copy_deadline = calculate_next_recurrence_due(
            base=due,
            freq=rule.freq,
            interval=rule.interval,
            byweekday=rule.byweekday,
            byday=rule.byday,
            bysetpos=rule.bysetpos,
        )
        copy = Card.objects.create(
            board=card.board,
            column=card.column,
            parent=card.parent,
            assignee=card.assignee,
            title=card.title,
            description=card.description,
            deadline=copy_deadline if card.deadline else None,
            priority=card.priority,
            parent_recurrence=rule,
        )
        copy.labels.set(card.labels.all())
        Attachment.objects.bulk_create(
            [
                Attachment(
                    card=copy,
                    name=attachment.name,
                    type=attachment.type,
                    url=attachment.url,
                    path=attachment.path,
                    mime=attachment.mime,
                    size=attachment.size,
                    uploaded_by=attachment.uploaded_by,
                )
                for attachment in card.attachments.all()
            ]
        )

        generated_count = rule.generated_count + 1
        # The copy's recurrence triggers when its own deadline arrives (same pattern).
        copy_next_due: datetime | None = copy_deadline
        if rule.until is not None and copy_deadline.date() > rule.until:
            copy_next_due = None
        if rule.count is not None and generated_count >= rule.count:
            copy_next_due = None

        RecurrenceRule.objects.create(
            card=copy,
            freq=rule.freq,
            interval=rule.interval,
            byweekday=rule.byweekday,
            byday=rule.byday,
            bysetpos=rule.bysetpos,
            until=rule.until,
            count=rule.count,
            generated_count=generated_count,
            last_generated_at=now,
            next_due=copy_next_due,
        )

        rule.generated_count = generated_count
        rule.last_generated_at = now
        rule.next_due = None
        rule.save(
            update_fields=[
                "generated_count",
                "last_generated_at",
                "next_due",
                "updated_at",
                "version",
            ]
        )

        from .broadcast import broadcast_board_event  # noqa: E402
        from .serializers import CardSerializer  # noqa: E402

        transaction.on_commit(
            lambda: broadcast_board_event(
                copy.board_id, "card.created", {"card": CardSerializer(copy).data}
            )
        )


@shared_task(bind=True, max_retries=2, default_retry_delay=30)
def prune_card_activity(self) -> None:
    card_ids = CardActivity.objects.order_by().values_list("card_id", flat=True).distinct()
    for card_id in card_ids:
        keep_ids = list(
            CardActivity.objects.filter(card_id=card_id)
            .order_by("-created_at", "-id")
            .values_list("id", flat=True)[:30]
        )
        CardActivity.objects.filter(card_id=card_id).exclude(id__in=keep_ids).delete()


def _resolve_timezone_for_card(*, card: Card) -> str:
    """Whose local time the overdue text is shown in.

    The card has no reliable "author" trail (creation was never logged to
    `CardActivity`), so `created_by` — set going forward, `None` for cards
    created before it existed — is the primary source, and the board owner
    covers every card it can't answer for.
    """

    user_id = card.created_by_id or card.board.owner_id
    if not user_id:
        return "UTC"
    profile = NotificationProfile.objects.filter(user_id=user_id).first()
    return (profile.timezone if profile else "") or "UTC"


@shared_task(bind=True, max_retries=2, default_retry_delay=30)
def send_overdue_card_reminders(self) -> None:
    """Periodic task: raise one outbox event per overdue card per interval.

    Recipients, preferences and push delivery are the outbox's job
    (`dispatcher.process_outbox_events`), not this task's — it only decides
    *that* a card is overdue and *how often* to say so again.
    """
    from .notifications import create_notification_event

    site_settings = SiteSettings.load()
    interval_minutes = site_settings.overdue_reminder_interval

    now = timezone.now()
    overdue_cards = Card.objects.filter(
        deadline__lt=now, completed_at__isnull=True
    ).select_related("board")

    for card in overdue_cards:
        link = _build_card_link(card=card)
        tz_name = _resolve_timezone_for_card(card=card)
        deadline_text = _format_deadline_ru(dt=card.deadline, tz_name=tz_name)
        summary = f"Задача «{card.title}» просрочена. Дедлайн был {deadline_text}."

        # One event per card per interval: the bucket is the sole dedupe
        # source of truth, so a repeated tick inside the same window returns
        # the existing event instead of creating another one, regardless of
        # whether delivery for it already succeeded.
        bucket = int(now.timestamp() // (interval_minutes * 60))
        dedupe_key = f"card.overdue:{card.id}:{bucket}"

        create_notification_event(
            event_type=NotificationEventType.CARD_OVERDUE.value,
            actor=None,
            board=card.board,
            card=card,
            summary=summary,
            link=link,
            payload={"board": card.board.name, "card": card.title, "overdue": True},
            dedupe_key=dedupe_key,
        )
