"""Личная доставка через Telegram вместо Push (тикет 03).

Пользователь с подтверждённой привязкой выбирает Telegram и получает события
и личные напоминания в личный чат бота. Push при этом не отправляется,
Входящие сохраняются, а отключение привязки возвращает Push.
"""

from __future__ import annotations

import uuid
from datetime import timedelta

import pytest
from django.contrib.auth import get_user_model
from django.utils import timezone

from kanban import dispatcher
from kanban.models import (
    Card,
    CardDeadlineReminder,
    CardDeadlineReminderDelivery,
    NotificationDelivery,
    NotificationInboxEntry,
    NotificationPreference,
    NotificationProfile,
    PersonalDeliveryChannel,
    PushDevice,
    TelegramAccount,
)
from kanban.notifications import create_notification_event
from kanban.telegram import TelegramError
from tests.auth_helpers import client_for, make_push_device

User = get_user_model()

PROFILE_URL = "/api/v1/notifications/profile/"
TELEGRAM_URL = "/api/v1/notifications/telegram/"


def _link(user, chat_id: int = 12345) -> TelegramAccount:
    return TelegramAccount.objects.create(user=user, chat_id=chat_id)


def _set_channel(user, channel: str, *, changed_at=None) -> NotificationProfile:
    profile, _ = NotificationProfile.objects.get_or_create(user=user)
    profile.delivery_channel = channel
    profile.delivery_channel_changed_at = changed_at or timezone.now()
    profile.save(update_fields=["delivery_channel", "delivery_channel_changed_at"])
    return profile


def _event(actor, board):
    return create_notification_event(
        event_type="board.updated",
        actor=actor,
        board=board,
        summary="Обновлён список",
        payload={"board": board.name},
    )


# ---------------------------------------------------------------------------
# API: Telegram доступен только после привязки
# ---------------------------------------------------------------------------


@pytest.mark.django_db()
def test_telegram_choice_requires_link(auth_client, regular_user) -> None:
    response = auth_client.patch(PROFILE_URL, {"delivery_channel": "telegram"}, format="json")

    assert response.status_code == 400
    profile = NotificationProfile.objects.filter(user=regular_user).first()
    assert profile is None or profile.delivery_channel == PersonalDeliveryChannel.PUSH


@pytest.mark.django_db()
def test_linked_user_switches_to_telegram(auth_client, regular_user) -> None:
    _link(regular_user)

    response = auth_client.patch(PROFILE_URL, {"delivery_channel": "telegram"}, format="json")

    assert response.status_code == 200
    assert response.data["delivery_channel"] == PersonalDeliveryChannel.TELEGRAM
    profile = NotificationProfile.objects.get(user_id=regular_user.id)
    assert profile.delivery_channel == PersonalDeliveryChannel.TELEGRAM
    assert profile.delivery_channel_changed_at is not None


# ---------------------------------------------------------------------------
# Доставка событий в Telegram
# ---------------------------------------------------------------------------


@pytest.mark.django_db()
def test_telegram_event_goes_to_personal_chat_and_not_push(
    regular_user, board, webpush_settings, monkeypatch
) -> None:
    other = User.objects.create_user(username="user2", password="pw")
    make_push_device(other, kind=PushDevice.Kind.WEBPUSH, endpoint="https://push.example.com/2")
    _link(other, chat_id=777)
    _set_channel(other, PersonalDeliveryChannel.TELEGRAM)
    sent: list[tuple[int, str]] = []
    push_calls: list[dict] = []
    monkeypatch.setattr(
        "kanban.dispatcher.send_message",
        lambda *, chat_id, text: sent.append((chat_id, text)) or {"message_id": 1},
    )
    monkeypatch.setattr("kanban.webpush.send_webpush", lambda **kwargs: push_calls.append(kwargs))
    event = _event(regular_user, board)

    dispatcher.process_outbox_events()

    assert push_calls == []
    assert len(sent) == 1
    chat_id, text = sent[0]
    assert chat_id == 777
    assert "Обновлён список" in text
    delivery = NotificationDelivery.objects.get(event=event, user=other)
    assert delivery.channel == "telegram"
    assert delivery.status == NotificationDelivery.Status.SENT
    assert NotificationInboxEntry.objects.filter(event=event, user=other).exists()


@pytest.mark.django_db()
def test_telegram_failure_retries_without_push_fallback(regular_user, board, monkeypatch) -> None:
    other = User.objects.create_user(username="user2", password="pw")
    _link(other, chat_id=777)
    _set_channel(other, PersonalDeliveryChannel.TELEGRAM)
    send_calls: list[int] = []
    push_calls: list[dict] = []
    monkeypatch.setattr("kanban.webpush.send_webpush", lambda **kwargs: push_calls.append(kwargs))

    def failing_send(*, chat_id, text):
        send_calls.append(chat_id)
        raise TelegramError("Too Many Requests: retry after 5", status=429)

    monkeypatch.setattr("kanban.dispatcher.send_message", failing_send)
    event = _event(regular_user, board)

    dispatcher.process_outbox_events()

    assert push_calls == []
    assert send_calls == [777]
    event.refresh_from_db()
    assert event.dispatch_status == event.Dispatch.PENDING
    delivery = NotificationDelivery.objects.get(event=event, user=other)
    assert delivery.channel == "telegram"
    assert delivery.status == NotificationDelivery.Status.FAILED


# ---------------------------------------------------------------------------
# Изоляция ошибки одного адресата
# ---------------------------------------------------------------------------


@pytest.mark.django_db()
def test_permanent_telegram_error_does_not_block_other_recipients(
    regular_user, board, webpush_settings, monkeypatch
) -> None:
    """A permanently failed Telegram recipient must not stop a Push recipient."""
    telegram_user = User.objects.create_user(username="tg", password="pw")
    push_user = User.objects.create_user(username="push", password="pw")
    _link(telegram_user, chat_id=777)
    _set_channel(telegram_user, PersonalDeliveryChannel.TELEGRAM)
    make_push_device(push_user, kind=PushDevice.Kind.WEBPUSH, endpoint="https://push.example.com/9")
    push_calls: list[dict] = []
    monkeypatch.setattr("kanban.webpush.send_webpush", lambda **kwargs: push_calls.append(kwargs))

    def blocked_send(*, chat_id, text):
        raise TelegramError("Forbidden: bot was blocked by the user", status=403)

    monkeypatch.setattr("kanban.dispatcher.send_message", blocked_send)
    event = _event(regular_user, board)

    dispatcher.process_outbox_events()

    assert len(push_calls) == 1
    event.refresh_from_db()
    assert event.dispatch_status == event.Dispatch.DONE
    delivery = NotificationDelivery.objects.get(event=event, user=telegram_user)
    assert delivery.status == NotificationDelivery.Status.FAILED


@pytest.mark.django_db()
def test_transient_telegram_error_does_not_block_other_recipients(
    regular_user, board, webpush_settings, monkeypatch
) -> None:
    """A rate-limited Telegram recipient must not delay a Push recipient."""
    telegram_user = User.objects.create_user(username="tg", password="pw")
    push_user = User.objects.create_user(username="push", password="pw")
    _link(telegram_user, chat_id=777)
    _set_channel(telegram_user, PersonalDeliveryChannel.TELEGRAM)
    make_push_device(push_user, kind=PushDevice.Kind.WEBPUSH, endpoint="https://push.example.com/9")
    push_calls: list[dict] = []
    monkeypatch.setattr("kanban.webpush.send_webpush", lambda **kwargs: push_calls.append(kwargs))

    def rate_limited(*, chat_id, text):
        raise TelegramError("Too Many Requests: retry after 5", status=429)

    monkeypatch.setattr("kanban.dispatcher.send_message", rate_limited)
    event = _event(regular_user, board)

    dispatcher.process_outbox_events()

    assert len(push_calls) == 1
    event.refresh_from_db()
    assert event.dispatch_status == event.Dispatch.PENDING


# ---------------------------------------------------------------------------
# Личные фильтры сохраняются при выборе Telegram
# ---------------------------------------------------------------------------


@pytest.mark.django_db()
def test_telegram_honors_push_filters(regular_user, board, monkeypatch) -> None:
    other = User.objects.create_user(username="user2", password="pw")
    _link(other, chat_id=777)
    _set_channel(other, PersonalDeliveryChannel.TELEGRAM)
    NotificationPreference.objects.create(
        user=other,
        board=None,
        channel="push",
        event_type="board.updated",
        enabled=False,
    )
    sent: list[int] = []
    monkeypatch.setattr(
        "kanban.dispatcher.send_message",
        lambda *, chat_id, text: sent.append(chat_id) or {"message_id": 1},
    )
    event = _event(regular_user, board)

    dispatcher.process_outbox_events()

    assert sent == []
    assert not NotificationDelivery.objects.filter(event=event, user=other).exists()


@pytest.mark.django_db()
def test_telegram_honors_board_scoped_push_filters(regular_user, board, monkeypatch) -> None:
    other = User.objects.create_user(username="user2", password="pw")
    _link(other, chat_id=777)
    _set_channel(other, PersonalDeliveryChannel.TELEGRAM)
    NotificationPreference.objects.create(
        user=other,
        board=board,
        channel="push",
        event_type="board.updated",
        enabled=False,
    )
    sent: list[int] = []
    monkeypatch.setattr(
        "kanban.dispatcher.send_message",
        lambda *, chat_id, text: sent.append(chat_id) or {"message_id": 1},
    )
    event = _event(regular_user, board)

    dispatcher.process_outbox_events()

    assert sent == []
    assert not NotificationDelivery.objects.filter(event=event, user=other).exists()


@pytest.mark.django_db()
def test_telegram_reminder_honors_push_filters(column, monkeypatch) -> None:
    other = User.objects.create_user(username="user2", password="pw")
    _link(other, chat_id=777)
    _set_channel(
        other,
        PersonalDeliveryChannel.TELEGRAM,
        changed_at=timezone.now() - timedelta(hours=2),
    )
    NotificationPreference.objects.create(
        user=other,
        board=None,
        channel="push",
        event_type="card.deadline_reminder",
        enabled=False,
    )
    card = Card.objects.create(
        column=column,
        title="Напоминание с фильтром",
        deadline=timezone.now() + timedelta(hours=2),
    )
    reminder = _due_reminder(card, other)
    sent: list[int] = []
    monkeypatch.setattr(
        "kanban.dispatcher.send_message",
        lambda *, chat_id, text: sent.append(chat_id) or {"message_id": 1},
    )

    dispatcher.process_due_reminders()

    assert sent == []
    reminder.refresh_from_db()
    assert reminder.status == CardDeadlineReminder.Status.INVALID_CHANNEL
    assert "Telegram" in reminder.last_error


@pytest.mark.django_db()
def test_telegram_global_true_does_not_override_push_board_false(
    regular_user, board, monkeypatch
) -> None:
    """Board scope beats global scope across channels."""
    other = User.objects.create_user(username="user2", password="pw")
    _link(other, chat_id=777)
    _set_channel(other, PersonalDeliveryChannel.TELEGRAM)
    NotificationPreference.objects.create(
        user=other, board=None, channel="telegram", event_type="board.updated", enabled=True
    )
    NotificationPreference.objects.create(
        user=other, board=board, channel="push", event_type="board.updated", enabled=False
    )
    sent: list[int] = []
    monkeypatch.setattr(
        "kanban.dispatcher.send_message",
        lambda *, chat_id, text: sent.append(chat_id) or {"message_id": 1},
    )
    event = _event(regular_user, board)

    dispatcher.process_outbox_events()

    assert sent == []
    assert not NotificationDelivery.objects.filter(event=event, user=other).exists()


@pytest.mark.django_db()
def test_push_board_true_overrides_telegram_global_false(regular_user, board, monkeypatch) -> None:
    other = User.objects.create_user(username="user2", password="pw")
    _link(other, chat_id=777)
    _set_channel(other, PersonalDeliveryChannel.TELEGRAM)
    NotificationPreference.objects.create(
        user=other, board=None, channel="telegram", event_type="board.updated", enabled=False
    )
    NotificationPreference.objects.create(
        user=other, board=board, channel="push", event_type="board.updated", enabled=True
    )
    sent: list[int] = []
    monkeypatch.setattr(
        "kanban.dispatcher.send_message",
        lambda *, chat_id, text: sent.append(chat_id) or {"message_id": 1},
    )
    _event(regular_user, board)

    dispatcher.process_outbox_events()

    assert len(sent) == 1


@pytest.mark.django_db()
def test_switch_from_telegram_cancels_pending_event(regular_user, board, monkeypatch) -> None:
    other = User.objects.create_user(username="user2", password="pw")
    _link(other, chat_id=777)
    _set_channel(other, PersonalDeliveryChannel.TELEGRAM)
    sent: list[int] = []
    monkeypatch.setattr(
        "kanban.dispatcher.send_message",
        lambda *, chat_id, text: sent.append(chat_id) or {"message_id": 1},
    )
    event = _event(regular_user, board)

    # Switch back to Push before the dispatcher runs: the old-channel event
    # must not be re-sent through either channel.
    _set_channel(other, PersonalDeliveryChannel.PUSH)

    dispatcher.process_outbox_events()

    assert sent == []
    assert not NotificationDelivery.objects.filter(event=event, user=other).exists()


# ---------------------------------------------------------------------------
# Личные напоминания через Telegram
# ---------------------------------------------------------------------------


def _due_reminder(card: Card, user) -> CardDeadlineReminder:
    return CardDeadlineReminder.objects.create(
        card=card,
        user=user,
        enabled=True,
        offset_value=180,
        status=CardDeadlineReminder.Status.SCHEDULED,
        scheduled_at=timezone.now() - timedelta(hours=1),
        schedule_token=uuid.uuid4(),
    )


@pytest.mark.django_db()
def test_telegram_reminder_goes_to_personal_chat(column, monkeypatch) -> None:
    other = User.objects.create_user(username="user2", password="pw")
    _link(other, chat_id=777)
    _set_channel(
        other,
        PersonalDeliveryChannel.TELEGRAM,
        changed_at=timezone.now() - timedelta(hours=2),
    )
    card = Card.objects.create(
        column=column,
        title="Скорое напоминание",
        deadline=timezone.now() + timedelta(hours=2),
    )
    reminder = _due_reminder(card, other)
    sent: list[tuple[int, str]] = []
    monkeypatch.setattr(
        "kanban.dispatcher.send_message",
        lambda *, chat_id, text: sent.append((chat_id, text)) or {"message_id": 1},
    )

    dispatcher.process_due_reminders()

    assert len(sent) == 1
    chat_id, text = sent[0]
    assert chat_id == 777
    assert "Скорое напоминание" in text
    reminder.refresh_from_db()
    assert reminder.status == CardDeadlineReminder.Status.SENT
    delivery = CardDeadlineReminderDelivery.objects.get(reminder=reminder)
    assert delivery.channel == "telegram"
    assert delivery.status == CardDeadlineReminderDelivery.Status.SENT


@pytest.mark.django_db()
def test_telegram_reminder_without_link_is_invalid(column) -> None:
    other = User.objects.create_user(username="user2", password="pw")
    _set_channel(other, PersonalDeliveryChannel.TELEGRAM)
    card = Card.objects.create(
        column=column,
        title="Напоминание без привязки",
        deadline=timezone.now() + timedelta(hours=2),
    )
    reminder = _due_reminder(card, other)

    dispatcher.process_due_reminders()

    reminder.refresh_from_db()
    assert reminder.status == CardDeadlineReminder.Status.INVALID_CHANNEL
    assert "Telegram" in reminder.last_error


@pytest.mark.django_db()
def test_blocked_account_gets_no_telegram_reminder(column, monkeypatch) -> None:
    other = User.objects.create_user(username="user2", password="pw")
    _link(other, chat_id=777)
    _set_channel(
        other, PersonalDeliveryChannel.TELEGRAM, changed_at=timezone.now() - timedelta(hours=2)
    )
    card = Card.objects.create(
        column=column,
        title="Напоминание заблокированному",
        deadline=timezone.now() + timedelta(hours=2),
    )
    reminder = _due_reminder(card, other)
    sent: list[int] = []
    monkeypatch.setattr(
        "kanban.dispatcher.send_message",
        lambda *, chat_id, text: sent.append(chat_id) or {"message_id": 1},
    )
    other.is_active = False
    other.save(update_fields=["is_active"])

    dispatcher.process_due_reminders()

    assert sent == []
    reminder.refresh_from_db()
    assert reminder.status == CardDeadlineReminder.Status.SCHEDULED


@pytest.mark.django_db()
def test_permanent_telegram_error_surfaces_and_keeps_channel(
    regular_user, board, monkeypatch
) -> None:
    """A permanent rejection is shown in settings and never re-routes to Push."""
    other = User.objects.create_user(username="user2", password="pw")
    _link(other, chat_id=777)
    _set_channel(other, PersonalDeliveryChannel.TELEGRAM)

    def blocked_send(*, chat_id, text):
        raise TelegramError("Forbidden: bot was blocked by the user", status=403)

    monkeypatch.setattr("kanban.dispatcher.send_message", blocked_send)
    _event(regular_user, board)

    dispatcher.process_outbox_events()

    account = TelegramAccount.objects.get(user=other)
    assert "bot was blocked" in account.last_error

    response = client_for(other).get(TELEGRAM_URL)
    assert response.status_code == 200
    assert response.data["linked"] is True
    assert "bot was blocked" in response.data["last_error"]

    profile = NotificationProfile.objects.get(user=other)
    assert profile.delivery_channel == PersonalDeliveryChannel.TELEGRAM


# ---------------------------------------------------------------------------
# Отключение привязки возвращает Push
# ---------------------------------------------------------------------------


@pytest.mark.django_db()
def test_unlink_switches_telegram_to_push(auth_client, regular_user) -> None:
    _link(regular_user)
    _set_channel(regular_user, PersonalDeliveryChannel.TELEGRAM)

    response = auth_client.delete(TELEGRAM_URL)

    assert response.status_code == 204
    assert not TelegramAccount.objects.filter(user=regular_user).exists()
    profile = NotificationProfile.objects.get(user_id=regular_user.id)
    assert profile.delivery_channel == PersonalDeliveryChannel.PUSH


@pytest.mark.django_db()
def test_unlink_keeps_push_and_disabled_choice(regular_user) -> None:
    other = User.objects.create_user(username="user2", password="pw")
    _link(regular_user)
    _set_channel(regular_user, PersonalDeliveryChannel.PUSH)
    _link(other)
    _set_channel(other, PersonalDeliveryChannel.DISABLED)

    client_for(regular_user).delete(TELEGRAM_URL)
    client_for(other).delete(TELEGRAM_URL)

    assert NotificationProfile.objects.get(user_id=regular_user.id).delivery_channel == (
        PersonalDeliveryChannel.PUSH
    )
    assert NotificationProfile.objects.get(user_id=other.id).delivery_channel == (
        PersonalDeliveryChannel.DISABLED
    )
