from __future__ import annotations

import json
import logging
from datetime import datetime
from urllib import request
from urllib.error import HTTPError, URLError
from urllib.parse import urlparse
from zoneinfo import ZoneInfo

from celery import shared_task
from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.mail import send_mail
from django.db.models import Q
from django.db.utils import IntegrityError
from django.utils import timezone
from django.utils.text import Truncator

from .inbox import get_or_create_user_inbox
from .models import (
    Attachment,
    Card,
    CardActivity,
    CardDeadlineReminder,
    CardDeadlineReminderDelivery,
    InboxSchedule,
    NotificationChannel,
    NotificationDelivery,
    NotificationEvent,
    NotificationEventType,
    NotificationInboxEntry,
    NotificationPreference,
    NotificationProfile,
    RecurrenceFrequency,
    RecurrenceRule,
    SiteSettings,
)
from .reminders import reminder_channel_availability, resolve_delivery_channel

User = get_user_model()

logger = logging.getLogger(__name__)

FCM_SCOPE = "https://www.googleapis.com/auth/firebase.messaging"


class InvalidFcmTokenError(RuntimeError):
    pass


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
    import calendar

    month_index = value.month - 1 + months
    year = value.year + month_index // 12
    month = month_index % 12 + 1
    max_day = calendar.monthrange(year, month)[1]
    return value.replace(year=year, month=month, day=min(day, max_day))


def _nth_weekday_of_month(base: datetime, months: int, weekday: int, pos: int) -> datetime:
    """Return the pos-th occurrence of weekday in the target month (pos<0 counts from end)."""
    import calendar

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
    if unit == CardDeadlineReminder.Unit.HOURS:
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
    # Frontend has a board page; we include a fragment with card id for quick manual search.
    return f"{base}/boards/{card.board_id}#card-{card.id}"


@shared_task(bind=True, max_retries=5, default_retry_delay=60)
def send_card_deadline_reminder(self, reminder_id: int, schedule_token: str) -> None:
    reminder = (
        CardDeadlineReminder.objects.filter(id=reminder_id).select_related("card", "user").first()
    )
    if not reminder:
        return

    # Skip outdated enqueued tasks after reschedule.
    if not reminder.schedule_token or str(reminder.schedule_token) != str(schedule_token):
        return

    card = Card.objects.filter(id=reminder.card_id).first()
    if not card or not card.deadline:
        reminder.status = CardDeadlineReminder.Status.INVALID_NO_DEADLINE
        reminder.scheduled_at = None
        reminder.schedule_token = None
        reminder.save(
            update_fields=[
                "status",
                "scheduled_at",
                "schedule_token",
                "updated_at",
                "version",
            ]
        )
        return

    availability = reminder_channel_availability(
        user_id=reminder.user_id,
        board_id=card.board_id,
        event_type="card.deadline_reminder",
    )
    channel = resolve_delivery_channel(reminder=reminder, availability=availability)
    if not channel:
        reminder.status = CardDeadlineReminder.Status.INVALID_CHANNEL
        reminder.scheduled_at = None
        reminder.schedule_token = None
        reminder.save(
            update_fields=[
                "status",
                "scheduled_at",
                "schedule_token",
                "updated_at",
                "version",
            ]
        )
        return

    # Idempotency: one delivery per (reminder, schedule_token).
    dedupe_key = f"card.deadline_reminder:{reminder.id}:{schedule_token}"
    try:
        delivery, _created = CardDeadlineReminderDelivery.objects.get_or_create(
            dedupe_key=dedupe_key,
            defaults={
                "reminder_id": reminder.id,
                "card_id": card.id,
                "user_id": reminder.user_id,
                "channel": channel,
                "status": CardDeadlineReminderDelivery.Status.QUEUED,
            },
        )
    except IntegrityError:
        delivery = CardDeadlineReminderDelivery.objects.get(dedupe_key=dedupe_key)

    if delivery.status == CardDeadlineReminderDelivery.Status.SENT:
        return

    # Mark processing (safe on retries)
    if delivery.status != CardDeadlineReminderDelivery.Status.PROCESSING:
        delivery.status = CardDeadlineReminderDelivery.Status.PROCESSING
        delivery.started_at = timezone.now()
        delivery.save(update_fields=["status", "started_at"])

    profile, _ = NotificationProfile.objects.get_or_create(user_id=reminder.user_id)
    offset_text = _format_offset_ru(value=reminder.offset_value, unit=reminder.offset_unit)
    deadline_text = _format_deadline_ru(dt=card.deadline, tz_name=profile.timezone)
    link = _build_card_link(card=card)

    subject = f"Напоминание: {card.title}"
    body_lines = [
        f"Напоминание по задаче: {card.title}",
        f"Дедлайн: {deadline_text}",
        f"Интервал: {offset_text}",
        "",
        f"Открыть задачу: {link}",
    ]
    body = "\n".join(body_lines)

    try:
        if channel == NotificationChannel.EMAIL:
            if not profile.email:
                raise RuntimeError("Email is not configured")
            _send_email(profile.email, subject, body)
        elif channel == NotificationChannel.TELEGRAM:
            if not profile.telegram_chat_id:
                raise RuntimeError("Telegram chat_id is not configured")
            _send_telegram(profile.telegram_chat_id, body)
        elif channel == NotificationChannel.PUSH:
            fcm_token = (profile.fcm_token or "").strip()
            if not fcm_token:
                raise RuntimeError("Push is not configured")
            push_data = _build_fcm_data_payload(
                notification_id=None,
                event_type=NotificationEventType.CARD_DEADLINE_REMINDER.value,
                title=subject,
                body=body,
                link=link,
                board_id=card.board_id,
                card_id=card.id,
            )
            try:
                _send_push(fcm_token, subject, body, data=push_data)
            except InvalidFcmTokenError:
                _clear_fcm_token(profile, fcm_token)
                raise
        else:
            raise RuntimeError(f"Unsupported channel: {channel}")

        delivery.status = CardDeadlineReminderDelivery.Status.SENT
        delivery.sent_at = timezone.now()
        delivery.save(update_fields=["status", "sent_at"])

        reminder.status = CardDeadlineReminder.Status.SENT
        reminder.sent_at = delivery.sent_at
        reminder.last_error = ""
        reminder.save(update_fields=["status", "sent_at", "last_error", "updated_at", "version"])
    except InvalidFcmTokenError as exc:
        delivery.status = CardDeadlineReminderDelivery.Status.FAILED
        delivery.error = str(exc)
        delivery.save(update_fields=["status", "error"])

        reminder.status = CardDeadlineReminder.Status.FAILED
        reminder.last_error = str(exc)
        reminder.save(update_fields=["status", "last_error", "updated_at", "version"])
    except Exception as exc:  # noqa: BLE001
        delivery.status = CardDeadlineReminderDelivery.Status.FAILED
        delivery.error = str(exc)
        delivery.save(update_fields=["status", "error"])

        reminder.status = CardDeadlineReminder.Status.FAILED
        reminder.last_error = str(exc)
        reminder.save(update_fields=["status", "last_error", "updated_at", "version"])
        raise self.retry(exc=exc)


def _event_title(event: NotificationEvent) -> str:
    actor = event.actor
    actor_name = (actor.first_name or actor.username) if actor else "Система"
    return f"{actor_name}: {event.summary}"


def _event_body(event: NotificationEvent) -> str:
    payload = event.payload or {}
    board = payload.get("board") or (event.board.name if event.board else "")
    column = payload.get("column") or (event.column.name if event.column else "")
    card = payload.get("card") or (event.card.title if event.card else "")
    lines = [
        event.summary,
        "",
    ]
    if board:
        lines.append(f"Доска: {board}")
    if column:
        lines.append(f"Колонка: {column}")
    if card:
        lines.append(f"Карточка: {card}")
    if event.link:
        lines.extend(["", f"Перейти: {event.link}"])
    return "\n".join(lines)


def _send_email(to_email: str, subject: str, body: str) -> None:
    send_mail(
        subject=subject,
        message=body,
        from_email=settings.DEFAULT_FROM_EMAIL,
        recipient_list=[to_email],
        fail_silently=False,
    )


def _send_telegram(chat_id: str, message: str) -> None:
    token = settings.TELEGRAM_BOT_TOKEN
    if not token:
        raise RuntimeError("TELEGRAM_BOT_TOKEN is not configured")
    payload = json.dumps({"chat_id": chat_id, "text": message}).encode("utf-8")
    url = f"https://api.telegram.org/bot{token}/sendMessage"
    parsed = urlparse(url)
    if parsed.scheme != "https" or parsed.netloc != "api.telegram.org":
        raise RuntimeError("Refusing to send Telegram request to non-official host")

    req = request.Request(
        url=url,
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with request.urlopen(req, timeout=10) as resp:
            if resp.status >= 400:
                raise RuntimeError(f"Telegram API error: HTTP {resp.status}")
    except HTTPError as exc:
        # Telegram API usually returns a JSON body like:
        # {"ok":false,"error_code":403,"description":"Forbidden: bot was blocked by the user"}
        body = ""
        try:
            body = exc.read().decode("utf-8", errors="replace")
        except Exception:  # noqa: BLE001
            body = "<failed to read response body>"
        logger.warning("Telegram API HTTPError: status=%s body=%s", exc.code, body)
        raise RuntimeError(f"Telegram API error: HTTP {exc.code}; body={body}") from exc
    except URLError as exc:
        logger.warning("Telegram API URLError: %s", exc)
        raise RuntimeError(f"Telegram API connection error: {exc}") from exc


def _build_fcm_data_payload(
    *,
    notification_id: int | None,
    event_type: str,
    title: str,
    body: str,
    link: str | None,
    board_id: int | None,
    card_id: int | None,
) -> dict[str, str]:
    return {
        "notificationId": str(notification_id or ""),
        "eventType": event_type,
        "title": title,
        "body": body,
        "link": link or "",
        "boardId": str(board_id or ""),
        "cardId": str(card_id or ""),
    }


def _fcm_auth_token() -> tuple[str, str]:
    service_account_file = settings.FCM_SERVICE_ACCOUNT_FILE
    if not service_account_file:
        raise RuntimeError("FCM_SERVICE_ACCOUNT_FILE is not configured")

    try:
        from google.auth.transport.requests import Request as GoogleAuthRequest
        from google.oauth2 import service_account
    except ImportError as exc:  # pragma: no cover - deployment dependency guard
        raise RuntimeError(
            "google-auth with requests transport is required for FCM push delivery"
        ) from exc

    credentials = service_account.Credentials.from_service_account_file(
        service_account_file,
        scopes=[FCM_SCOPE],
    )
    project_id = (settings.FCM_PROJECT_ID or credentials.project_id or "").strip()
    if not project_id:
        raise RuntimeError("FCM_PROJECT_ID is not configured and service account has no project_id")
    credentials.refresh(GoogleAuthRequest())
    access_token = credentials.token
    if not access_token:
        raise RuntimeError("Failed to obtain FCM access token")
    return access_token, project_id


def _is_invalid_fcm_token(status_code: int, response_body: str) -> bool:
    if status_code not in {400, 404}:
        return False
    try:
        payload = json.loads(response_body)
    except json.JSONDecodeError:
        payload = {}

    error = payload.get("error") if isinstance(payload, dict) else None
    details = error.get("details", []) if isinstance(error, dict) else []
    for detail in details:
        if not isinstance(detail, dict):
            continue
        error_code = detail.get("errorCode")
        if error_code in {"UNREGISTERED", "INVALID_ARGUMENT"}:
            return True

    lowered = response_body.lower()
    return "unregistered" in lowered or "registration token" in lowered


def _send_push(
    fcm_token: str,
    title: str,
    message: str,
    event_id: int | None = None,
    data: dict[str, str] | None = None,
) -> None:
    fcm_token = fcm_token.strip()
    if not fcm_token:
        raise RuntimeError("FCM token is not configured")

    access_token, project_id = _fcm_auth_token()
    url = f"https://fcm.googleapis.com/v1/projects/{project_id}/messages:send"
    parsed = urlparse(url)
    if parsed.scheme != "https" or parsed.netloc != "fcm.googleapis.com":
        raise RuntimeError("Refusing to send FCM request to invalid host")

    payload_data = data or _build_fcm_data_payload(
        notification_id=event_id,
        event_type="",
        title=title,
        body=message,
        link="",
        board_id=None,
        card_id=None,
    )
    payload = {
        "message": {
            "token": fcm_token,
            "data": {key: str(value) for key, value in payload_data.items()},
            "android": {
                "priority": "HIGH",
            },
        }
    }

    req = request.Request(
        url=url,
        data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {access_token}",
            "Content-Type": "application/json; charset=utf-8",
        },
        method="POST",
    )

    try:
        with request.urlopen(req, timeout=10) as resp:
            body = resp.read().decode("utf-8", errors="replace")
            if resp.status >= 400:
                raise RuntimeError(f"FCM API error: HTTP {resp.status}; body={body}")

            logger.info(
                "fcm_push_delivery_sent event_id=%s status=%s response=%s",
                event_id,
                resp.status,
                body,
            )
    except HTTPError as exc:
        body = ""
        try:
            body = exc.read().decode("utf-8", errors="replace")
        except Exception:  # noqa: BLE001
            body = "<failed to read response body>"
        if _is_invalid_fcm_token(exc.code, body):
            logger.warning(
                "fcm_push_invalid_token event_id=%s status=%s body=%s",
                event_id,
                exc.code,
                body,
            )
            raise InvalidFcmTokenError(
                f"FCM token is invalid or unregistered: HTTP {exc.code}"
            ) from exc
        logger.warning(
            "fcm_push_delivery_failed event_id=%s status=%s reason=http_error body=%s",
            event_id,
            exc.code,
            body,
        )
        raise RuntimeError(f"FCM API error: HTTP {exc.code}; body={body}") from exc
    except URLError as exc:
        logger.warning(
            "fcm_push_delivery_failed event_id=%s reason=url_error error=%s",
            event_id,
            exc,
        )
        raise RuntimeError(f"FCM API connection error: {exc}") from exc


def _clear_fcm_token(profile: NotificationProfile, token: str) -> None:
    if profile.fcm_token != token:
        return
    profile.fcm_token = ""
    profile.save(update_fields=["fcm_token"])


def _preferences_enabled(user_id: int, event: NotificationEvent, channel: str) -> bool:
    qs = NotificationPreference.objects.filter(
        user_id=user_id,
        channel=channel,
        event_type=event.event_type,
    )
    if event.board_id:
        board_qs = qs.filter(board_id=event.board_id)
        if board_qs.exists():
            return bool(board_qs.filter(enabled=True).exists())
    global_qs = qs.filter(board__isnull=True)
    if global_qs.exists():
        return bool(global_qs.filter(enabled=True).exists())
    return True


@shared_task(bind=True, max_retries=3, default_retry_delay=30)
def send_notification_event(self, event_id: int) -> None:
    event = (
        NotificationEvent.objects.filter(id=event_id)
        .select_related("actor", "board", "column", "card")
        .first()
    )
    if not event:
        return

    users = User.objects.all().order_by("id")
    profiles = {p.user_id: p for p in NotificationProfile.objects.filter(user__in=users)}

    subject = Truncator(_event_title(event)).chars(120)
    body = _event_body(event)
    mention_user_ids = (
        event.payload.get("mention_user_ids") if isinstance(event.payload, dict) else None
    )

    for user in users:
        if isinstance(mention_user_ids, list) and mention_user_ids:
            if user.id not in {int(item) for item in mention_user_ids if str(item).isdigit()}:
                continue
        profile = profiles.get(user.id)
        if not profile:
            profile = NotificationProfile.objects.create(user=user)

        NotificationInboxEntry.objects.get_or_create(event=event, user=user)

        for channel in [
            NotificationChannel.EMAIL,
            NotificationChannel.TELEGRAM,
            NotificationChannel.PUSH,
        ]:
            channel_value = channel[0] if isinstance(channel, tuple) else channel
            if not _preferences_enabled(user.id, event, channel_value):
                continue

            if channel_value == NotificationChannel.EMAIL:
                target_email = profile.email
                if not target_email:
                    continue
                delivery = NotificationDelivery.objects.create(
                    event=event,
                    user=user,
                    channel=channel,
                )
                try:
                    _send_email(target_email, subject, body)
                    delivery.status = NotificationDelivery.Status.SENT
                    delivery.sent_at = timezone.now()
                    delivery.save(update_fields=["status", "sent_at"])
                except Exception as exc:  # noqa: BLE001
                    delivery.status = NotificationDelivery.Status.FAILED
                    delivery.error = str(exc)
                    delivery.save(update_fields=["status", "error"])
                    continue

            if channel_value == NotificationChannel.TELEGRAM:
                target_chat = profile.telegram_chat_id
                if not target_chat:
                    continue
                delivery = NotificationDelivery.objects.create(
                    event=event,
                    user=user,
                    channel=channel,
                )
                try:
                    _send_telegram(target_chat, body)
                    delivery.status = NotificationDelivery.Status.SENT
                    delivery.sent_at = timezone.now()
                    delivery.save(update_fields=["status", "sent_at"])
                except Exception as exc:  # noqa: BLE001
                    delivery.status = NotificationDelivery.Status.FAILED
                    delivery.error = str(exc)
                    delivery.save(update_fields=["status", "error"])
                    continue

            if channel_value == NotificationChannel.PUSH:
                target_fcm_token = (profile.fcm_token or "").strip()
                if not target_fcm_token:
                    continue
                delivery = NotificationDelivery.objects.create(
                    event=event,
                    user=user,
                    channel=channel,
                )
                try:
                    push_payload = _build_fcm_data_payload(
                        notification_id=event.id,
                        event_type=event.event_type,
                        title=str(subject),
                        body=body,
                        link=event.link,
                        board_id=event.board_id,
                        card_id=event.card_id,
                    )
                    _send_push(
                        target_fcm_token,
                        str(subject),
                        body,
                        event_id=event.id,
                        data=push_payload,
                    )
                    delivery.status = NotificationDelivery.Status.SENT
                    delivery.sent_at = timezone.now()
                    delivery.save(update_fields=["status", "sent_at"])
                except InvalidFcmTokenError as exc:
                    _clear_fcm_token(profile, target_fcm_token)
                    delivery.status = NotificationDelivery.Status.FAILED
                    delivery.error = str(exc)
                    delivery.save(update_fields=["status", "error"])
                    continue
                except Exception as exc:  # noqa: BLE001
                    delivery.status = NotificationDelivery.Status.FAILED
                    delivery.error = str(exc)
                    delivery.save(update_fields=["status", "error"])
                    continue


@shared_task(bind=True, max_retries=2, default_retry_delay=30)
def generate_recurring_cards(self) -> None:
    now = timezone.now()
    rules = (
        RecurrenceRule.objects.filter(next_due__isnull=False, next_due__lte=now)
        .select_related("card", "card__column", "card__board", "card__assignee")
        .order_by("next_due", "id")
    )

    for rule in rules:
        card = rule.card
        if card.archived_at is not None or card.column.archived_at is not None:
            continue
        if rule.until is not None and rule.next_due and rule.next_due.date() > rule.until:
            continue
        if rule.count is not None and rule.generated_count >= rule.count:
            continue

        due = rule.next_due or now
        copy = Card.objects.create(
            board=card.board,
            column=card.column,
            parent=card.parent,
            assignee=card.assignee,
            title=card.title,
            description=card.description,
            deadline=due if card.deadline else None,
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
        next_due = calculate_next_recurrence_due(
            base=due,
            freq=rule.freq,
            interval=rule.interval,
            byweekday=rule.byweekday,
            byday=rule.byday,
            bysetpos=rule.bysetpos,
        )
        copy_next_due: datetime | None = next_due
        if rule.until is not None and next_due.date() > rule.until:
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

        broadcast_board_event(copy.board_id, "card.created", {"card": CardSerializer(copy).data})


@shared_task(bind=True, max_retries=2, default_retry_delay=30)
def process_inbox_schedules(self) -> None:
    now = timezone.now()
    schedules = (
        InboxSchedule.objects.select_related("user", "target_column", "target_column__board")
        .filter(status=InboxSchedule.Status.SCHEDULED, move_at__lte=now)
        .order_by("move_at", "id")
    )

    from .broadcast import broadcast_board_event  # noqa: E402
    from .serializers import CardSerializer  # noqa: E402

    for schedule in schedules:
        _board, inbox_column = get_or_create_user_inbox(schedule.user)
        cards = list(
            Card.objects.select_related("board", "column")
            .prefetch_related(
                "labels",
                "checklist_items",
                "subtasks__labels",
                "subtasks__checklist_items",
                "attachments",
                "recurrence_rule",
            )
            .filter(column=inbox_column, parent__isnull=True)
            .order_by("position", "id")
        )
        moved_count = 0
        for card in cards:
            source_board_id = card.board_id
            card.column = schedule.target_column
            card.save(update_fields=["column", "board", "updated_at", "version"])
            moved_count += 1
            broadcast_board_event(source_board_id, "card.deleted", {"card_id": card.id})
            broadcast_board_event(
                card.board_id,
                "card.created",
                {"card": CardSerializer(card).data},
            )

        schedule.status = InboxSchedule.Status.COMPLETED
        schedule.moved_count = moved_count
        schedule.save(update_fields=["status", "moved_count", "updated_at", "version"])


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


@shared_task(bind=True, max_retries=2, default_retry_delay=30)
def send_overdue_card_reminders(self) -> None:
    """Periodic task: send FCM reminders for overdue cards not in 'Done' columns."""
    site_settings = SiteSettings.load()
    interval_minutes = site_settings.overdue_reminder_interval

    now = timezone.now()
    cutoff = now - timezone.timedelta(minutes=interval_minutes)

    overdue_cards = (
        Card.objects.filter(deadline__lt=now)
        .exclude(Q(column__is_done=True) | Q(column__name__iexact="Done"))
        .select_related("board", "column")
    )

    if not overdue_cards.exists():
        return

    from .notifications import build_frontend_link  # noqa: E402

    profiles = NotificationProfile.objects.select_related("user")

    if not profiles.exists():
        return

    for card in overdue_cards:
        recent_delivery = NotificationDelivery.objects.filter(
            event__dedupe_key__startswith=f"card.overdue_reminder:{card.id}:",
            event__created_at__gte=cutoff,
            status=NotificationDelivery.Status.SENT,
        ).exists()

        if recent_delivery:
            continue

        link = _build_card_link(card=card)
        title = "Задача просрочена"
        body_text = (
            f"Задача «{card.title}» просрочена.\n"
            f"Дедлайн: {_format_deadline_ru(dt=card.deadline, tz_name='Europe/Moscow')}\n"
            f"Доска: {card.board.name}\n"
            f"Колонка: {card.column.name}\n\n"
            f"Перенесите задачу в колонку «Done» после выполнения.\n"
            f"Открыть: {link}"
        )

        bucket = now.strftime("%Y%m%d%H%M")
        dedupe_key = f"card.overdue_reminder:{card.id}:{bucket}"

        try:
            event, _created = NotificationEvent.objects.get_or_create(
                dedupe_key=dedupe_key,
                defaults={
                    "event_type": NotificationEventType.CARD_DEADLINE_REMINDER.value,
                    "actor": None,
                    "board": card.board,
                    "column": card.column,
                    "card": card,
                    "summary": f"Задача «{card.title}» просрочена",
                    "link": link or build_frontend_link(card.board_id),
                    "payload": {
                        "board": card.board.name,
                        "column": card.column.name,
                        "card": card.title,
                        "overdue": True,
                    },
                    "dedupe_key": dedupe_key,
                },
            )
        except IntegrityError:
            event = NotificationEvent.objects.filter(dedupe_key=dedupe_key).first()
            if not event:
                continue

        if not event or not event.pk:
            continue

        for profile in profiles:
            NotificationInboxEntry.objects.get_or_create(event=event, user=profile.user)

            fcm_token = (profile.fcm_token or "").strip()
            if not fcm_token:
                continue

            delivery = NotificationDelivery.objects.create(
                event=event,
                user=profile.user,
                channel=NotificationChannel.PUSH,
            )
            try:
                push_payload = _build_fcm_data_payload(
                    notification_id=event.id,
                    event_type=event.event_type,
                    title=title,
                    body=body_text,
                    link=link,
                    board_id=card.board_id,
                    card_id=card.id,
                )
                _send_push(fcm_token, title, body_text, event_id=event.id, data=push_payload)
                delivery.status = NotificationDelivery.Status.SENT
                delivery.sent_at = timezone.now()
                delivery.save(update_fields=["status", "sent_at"])
            except InvalidFcmTokenError as exc:
                _clear_fcm_token(profile, fcm_token)
                delivery.status = NotificationDelivery.Status.FAILED
                delivery.error = str(exc)
                delivery.save(update_fields=["status", "error"])
                logger.warning(
                    "overdue_push_invalid_fcm_token card=%s user=%s error=%s",
                    card.id,
                    profile.user_id,
                    exc,
                )
            except Exception as exc:  # noqa: BLE001
                delivery.status = NotificationDelivery.Status.FAILED
                delivery.error = str(exc)
                delivery.save(update_fields=["status", "error"])
                logger.warning(
                    "overdue_push_failed card=%s user=%s error=%s",
                    card.id,
                    profile.user_id,
                    exc,
                )
