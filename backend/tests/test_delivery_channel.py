"""Личный выбор канала доставки: Push или «Выключено» (тикет 01).

Выбор принадлежит пользователю, действует на все его устройства и отменяет
ожидающие отправки. Входящие и личные фильтры событий от него не зависят.
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
    NotificationProfile,
    PersonalDeliveryChannel,
    PushDevice,
)
from kanban.notifications import create_notification_event
from kanban.reminders import upsert_and_schedule_reminder
from tests.auth_helpers import client_for, make_push_device

User = get_user_model()

PROFILE_URL = "/api/v1/notifications/profile/"


def _device(user) -> PushDevice:
    return make_push_device(
        user,
        kind=PushDevice.Kind.WEBPUSH,
        endpoint=f"https://push.example.com/{user.id}",
        p256dh="p256dh-key",
        auth="auth-key",
    )


def _disable(user) -> NotificationProfile:
    profile, _ = NotificationProfile.objects.get_or_create(user=user)
    profile.delivery_channel = PersonalDeliveryChannel.DISABLED
    profile.delivery_channel_changed_at = timezone.now()
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
# API: настройка доступна любому пользователю и только для себя
# ---------------------------------------------------------------------------


@pytest.mark.django_db()
def test_member_reads_and_switches_own_channel(auth_client, regular_user) -> None:
    response = auth_client.get(PROFILE_URL)

    assert response.status_code == 200
    assert response.data["delivery_channel"] == PersonalDeliveryChannel.PUSH

    response = auth_client.patch(PROFILE_URL, {"delivery_channel": "disabled"}, format="json")

    assert response.status_code == 200
    assert response.data["delivery_channel"] == PersonalDeliveryChannel.DISABLED
    profile = NotificationProfile.objects.get(user_id=regular_user.id)
    assert profile.delivery_channel_changed_at is not None


@pytest.mark.django_db()
def test_unknown_channel_is_rejected(auth_client) -> None:
    response = auth_client.patch(PROFILE_URL, {"delivery_channel": "telegram"}, format="json")

    assert response.status_code == 400


@pytest.mark.django_db()
def test_patch_never_touches_another_users_choice(regular_user) -> None:
    other = User.objects.create_user(username="user2", password="pw")
    other_client = client_for(other)

    response = other_client.patch(PROFILE_URL, {"delivery_channel": "disabled"}, format="json")

    assert response.status_code == 200
    regular_profile = NotificationProfile.objects.filter(user=regular_user).first()
    assert regular_profile is None or regular_profile.delivery_channel == (
        PersonalDeliveryChannel.PUSH
    )


# ---------------------------------------------------------------------------
# Доставка событий
# ---------------------------------------------------------------------------


@pytest.mark.django_db()
def test_disabled_channel_stops_push_but_keeps_inbox(
    regular_user, board, webpush_settings, monkeypatch
) -> None:
    other = User.objects.create_user(username="user2", password="pw")
    _device(other)
    send_calls = []
    monkeypatch.setattr("kanban.webpush.send_webpush", lambda **kwargs: send_calls.append(kwargs))
    _disable(other)
    event = _event(regular_user, board)

    dispatcher.process_outbox_events()

    assert send_calls == []
    assert not NotificationDelivery.objects.filter(event=event, user=other).exists()
    assert NotificationInboxEntry.objects.filter(event=event, user=other).exists()
    assert PushDevice.objects.filter(user=other, active=True).exists()


@pytest.mark.django_db()
def test_switch_cancels_a_still_unprocessed_event(
    regular_user, board, webpush_settings, monkeypatch
) -> None:
    other = User.objects.create_user(username="user2", password="pw")
    _device(other)
    send_calls = []
    monkeypatch.setattr("kanban.webpush.send_webpush", lambda **kwargs: send_calls.append(kwargs))
    event = _event(regular_user, board)
    _disable(other)

    dispatcher.process_outbox_events()

    assert send_calls == []
    assert not NotificationDelivery.objects.filter(event=event, user=other).exists()


@pytest.mark.django_db()
def test_switch_cancels_a_pending_retry(regular_user, board, webpush_settings, monkeypatch) -> None:
    other = User.objects.create_user(username="user2", password="pw")
    _device(other)
    send_calls = []

    def failing_send(**_kwargs) -> None:
        send_calls.append(_kwargs)
        raise RuntimeError("push service is down")

    monkeypatch.setattr("kanban.webpush.send_webpush", failing_send)
    event = _event(regular_user, board)

    dispatcher.process_outbox_events()
    assert len(send_calls) == 1
    event.refresh_from_db()
    assert event.dispatch_status == event.Dispatch.PENDING

    _disable(other)
    monkeypatch.setattr("kanban.webpush.send_webpush", lambda **kwargs: send_calls.append(kwargs))
    dispatcher.process_outbox_events(now=timezone.now() + timedelta(minutes=5))

    assert len(send_calls) == 1
    delivery = NotificationDelivery.objects.get(event=event, user=other)
    assert delivery.status == NotificationDelivery.Status.FAILED


@pytest.mark.django_db()
def test_reenable_does_not_resend_accumulated_history(
    regular_user, board, webpush_settings, monkeypatch
) -> None:
    other = User.objects.create_user(username="user2", password="pw")
    _device(other)
    monkeypatch.setattr("kanban.webpush.send_webpush", lambda **_kwargs: None)
    _disable(other)
    old_event = _event(regular_user, board)

    other_client = client_for(other)
    response = other_client.patch(PROFILE_URL, {"delivery_channel": "push"}, format="json")
    assert response.status_code == 200
    new_event = _event(regular_user, board)

    dispatcher.process_outbox_events()

    assert not NotificationDelivery.objects.filter(event=old_event, user=other).exists()
    new_delivery = NotificationDelivery.objects.get(event=new_event, user=other)
    assert new_delivery.status == NotificationDelivery.Status.SENT


# ---------------------------------------------------------------------------
# Личные напоминания
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
def test_disabled_channel_keeps_due_reminder_unsent(column, webpush_settings) -> None:
    other = User.objects.create_user(username="user2", password="pw")
    _device(other)
    card = Card.objects.create(
        column=column,
        title="Скорое напоминание",
        deadline=timezone.now() + timedelta(hours=2),
    )
    reminder = _due_reminder(card, other)
    _disable(other)

    dispatcher.process_due_reminders()

    reminder.refresh_from_db()
    assert reminder.status == CardDeadlineReminder.Status.INVALID_CHANNEL
    assert "выключены" in reminder.last_error
    assert CardDeadlineReminder.objects.filter(id=reminder.id).exists()
    assert not CardDeadlineReminderDelivery.objects.filter(
        reminder=reminder, status=CardDeadlineReminderDelivery.Status.SENT
    ).exists()


@pytest.mark.django_db()
def test_reenable_revives_a_reminder_stranded_while_off(column, webpush_settings) -> None:
    other = User.objects.create_user(username="user2", password="pw")
    _device(other)
    _disable(other)
    card = Card.objects.create(
        column=column,
        title="Напоминание на будущее",
        deadline=timezone.now() + timedelta(days=2),
    )
    reminder = CardDeadlineReminder.objects.create(card=card, user=other, enabled=True)
    upsert_and_schedule_reminder(card=card, reminder=reminder)
    reminder.refresh_from_db()
    assert reminder.status == CardDeadlineReminder.Status.INVALID_CHANNEL
    assert "выключены" in reminder.last_error

    other_client = client_for(other)
    response = other_client.patch(PROFILE_URL, {"delivery_channel": "push"}, format="json")
    assert response.status_code == 200

    reminder.refresh_from_db()
    assert reminder.status == CardDeadlineReminder.Status.SCHEDULED
    assert reminder.scheduled_at is not None


@pytest.mark.django_db()
def test_reenable_does_not_revive_a_reminder_whose_moment_passed(column, webpush_settings) -> None:
    """A reminder cancelled at its due moment stays cancelled after re-enable."""
    other = User.objects.create_user(username="user2", password="pw")
    _device(other)
    card = Card.objects.create(
        column=column,
        title="Напоминание в прошлом",
        deadline=timezone.now() + timedelta(hours=2),
    )
    reminder = _due_reminder(card, other)
    _disable(other)
    dispatcher.process_due_reminders()
    reminder.refresh_from_db()
    assert reminder.status == CardDeadlineReminder.Status.INVALID_CHANNEL

    other_client = client_for(other)
    response = other_client.patch(PROFILE_URL, {"delivery_channel": "push"}, format="json")
    assert response.status_code == 200

    reminder.refresh_from_db()
    assert reminder.status == CardDeadlineReminder.Status.INVALID_PAST
    assert not CardDeadlineReminderDelivery.objects.filter(
        reminder=reminder, status=CardDeadlineReminderDelivery.Status.SENT
    ).exists()


@pytest.mark.django_db()
def test_switch_between_claim_and_send_cancels_reminder(
    column, webpush_settings, monkeypatch
) -> None:
    """A disable landing after the claim but before the send must still win."""
    other = User.objects.create_user(username="user2", password="pw")
    _device(other)
    card = Card.objects.create(
        column=column,
        title="Напоминание в претензии",
        deadline=timezone.now() + timedelta(hours=2),
    )
    reminder = _due_reminder(card, other)
    send_calls: list[dict] = []
    monkeypatch.setattr("kanban.webpush.send_webpush", lambda **kwargs: send_calls.append(kwargs))
    real_message = dispatcher._reminder_message

    def message_then_switch(reminder, card):
        _disable(reminder.user)
        return real_message(reminder, card)

    monkeypatch.setattr(dispatcher, "_reminder_message", message_then_switch)

    sent = dispatcher.process_due_reminders()

    assert sent == 0
    assert send_calls == []
    reminder.refresh_from_db()
    assert reminder.status == CardDeadlineReminder.Status.INVALID_CHANNEL
    delivery = CardDeadlineReminderDelivery.objects.get(reminder=reminder)
    assert delivery.status == CardDeadlineReminderDelivery.Status.FAILED
    assert "выключены" in delivery.error


@pytest.mark.django_db()
def test_reenable_does_not_resume_a_cancelled_retry(column, webpush_settings, monkeypatch) -> None:
    """A retry pending at the switch belongs to the old channel period."""
    other = User.objects.create_user(username="user2", password="pw")
    _device(other)
    card = Card.objects.create(
        column=column,
        title="Повторная попытка",
        deadline=timezone.now() + timedelta(hours=2),
    )
    reminder = _due_reminder(card, other)
    send_calls: list[dict] = []

    def failing_send(**kwargs) -> None:
        send_calls.append(kwargs)
        raise RuntimeError("push service is down")

    monkeypatch.setattr("kanban.webpush.send_webpush", failing_send)
    dispatcher.process_due_reminders()
    reminder.refresh_from_db()
    assert reminder.status == CardDeadlineReminder.Status.SCHEDULED
    assert reminder.next_attempt_at is not None

    _disable(other)
    other_client = client_for(other)
    response = other_client.patch(PROFILE_URL, {"delivery_channel": "push"}, format="json")
    assert response.status_code == 200
    monkeypatch.setattr("kanban.webpush.send_webpush", lambda **kwargs: send_calls.append(kwargs))

    sent = dispatcher.process_due_reminders(now=timezone.now() + timedelta(minutes=5))

    assert sent == 0
    assert len(send_calls) == 1
    reminder.refresh_from_db()
    assert reminder.status == CardDeadlineReminder.Status.INVALID_CHANNEL
    delivery = CardDeadlineReminderDelivery.objects.get(reminder=reminder)
    assert delivery.status == CardDeadlineReminderDelivery.Status.FAILED
    assert "выключены" in delivery.error
