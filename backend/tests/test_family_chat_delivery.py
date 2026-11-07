"""Доставка общих событий в семейный чат (тикет 05).

Пользователь с выбранным Telegram направляет общие события в подключённый
семейный чат; личные напоминания остаются личными, а одно событие публикуется
в чат один раз независимо от числа выбравших его получателей.
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
    FamilyTelegramChat,
    NotificationDelivery,
    NotificationPreference,
    NotificationProfile,
    PersonalDeliveryChannel,
    PushDevice,
    TelegramAccount,
    TelegramDeliveryTarget,
)
from kanban.notifications import create_notification_event
from kanban.telegram import TelegramChatLostError, TelegramError
from tests.auth_helpers import client_for, make_push_device

User = get_user_model()

PROFILE_URL = "/api/v1/notifications/profile/"
FAMILY_URL = "/api/v1/notifications/telegram/family/"

FAMILY_CHAT_ID = -100100


def _link(user, chat_id: int = 12345) -> TelegramAccount:
    return TelegramAccount.objects.create(user=user, chat_id=chat_id)


def _family_chat() -> FamilyTelegramChat:
    return FamilyTelegramChat.objects.create(pk=1, chat_id=FAMILY_CHAT_ID, title="Семья")


def _set_telegram(
    user,
    *,
    target: str = TelegramDeliveryTarget.PERSONAL,
    changed_at=None,
) -> NotificationProfile:
    profile, _ = NotificationProfile.objects.get_or_create(user=user)
    profile.delivery_channel = PersonalDeliveryChannel.TELEGRAM
    profile.delivery_channel_changed_at = changed_at or timezone.now() - timedelta(hours=2)
    profile.telegram_target = target
    profile.telegram_target_changed_at = timezone.now() - timedelta(hours=2)
    profile.save(
        update_fields=[
            "delivery_channel",
            "delivery_channel_changed_at",
            "telegram_target",
            "telegram_target_changed_at",
        ]
    )
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
# API: выбор семейного чата требует личную привязку и подключённый чат
# ---------------------------------------------------------------------------


@pytest.mark.django_db()
def test_family_target_requires_link(auth_client, regular_user) -> None:
    _family_chat()

    response = auth_client.patch(PROFILE_URL, {"telegram_target": "family"}, format="json")

    assert response.status_code == 400
    profile = NotificationProfile.objects.get(user_id=regular_user.id)
    assert profile.telegram_target == TelegramDeliveryTarget.PERSONAL


@pytest.mark.django_db()
def test_family_target_requires_connected_chat(auth_client, regular_user) -> None:
    _link(regular_user)

    response = auth_client.patch(PROFILE_URL, {"telegram_target": "family"}, format="json")

    assert response.status_code == 400


@pytest.mark.django_db()
def test_family_target_accepted_when_link_and_chat_present(auth_client, regular_user) -> None:
    _link(regular_user)
    _family_chat()

    response = auth_client.patch(PROFILE_URL, {"telegram_target": "family"}, format="json")

    assert response.status_code == 200
    assert response.data["telegram_target"] == TelegramDeliveryTarget.FAMILY
    profile = NotificationProfile.objects.get(user_id=regular_user.id)
    assert profile.telegram_target == TelegramDeliveryTarget.FAMILY


# ---------------------------------------------------------------------------
# Одно событие в семейный чат один раз
# ---------------------------------------------------------------------------


@pytest.mark.django_db()
def test_family_event_delivered_once_to_chat(regular_user, board, monkeypatch) -> None:
    _family_chat()
    for i in range(3):
        user = User.objects.create_user(username=f"fam{i}", password="pw")
        _link(user, chat_id=1000 + i)
        _set_telegram(user, target=TelegramDeliveryTarget.FAMILY)
    sent: list[tuple[int, str]] = []
    monkeypatch.setattr(
        "kanban.dispatcher.send_message",
        lambda *, chat_id, text: sent.append((chat_id, text)) or {"message_id": 1},
    )
    event = _event(regular_user, board)

    dispatcher.process_outbox_events()

    assert len(sent) == 1
    assert sent[0][0] == FAMILY_CHAT_ID
    delivery = NotificationDelivery.objects.get(event=event)
    assert delivery.family_chat_id == 1
    assert delivery.status == NotificationDelivery.Status.SENT
    # One row total, deduped by (event, chat) — not one per user.
    assert NotificationDelivery.objects.filter(event=event).count() == 1


@pytest.mark.django_db()
def test_family_event_not_sent_without_group_recipient(regular_user, board, monkeypatch) -> None:
    _family_chat()
    _link(regular_user, chat_id=777)
    _set_telegram(regular_user, target=TelegramDeliveryTarget.PERSONAL)
    sent: list[int] = []
    monkeypatch.setattr(
        "kanban.dispatcher.send_message",
        lambda *, chat_id, text: sent.append(chat_id) or {"message_id": 1},
    )
    _event(regular_user, board)

    dispatcher.process_outbox_events()

    assert FAMILY_CHAT_ID not in sent
    assert not NotificationDelivery.objects.filter(family_chat_id=1).exists()


@pytest.mark.django_db()
def test_family_event_respects_personal_telegram_filter(regular_user, board, monkeypatch) -> None:
    _family_chat()
    _link(regular_user, chat_id=777)
    _set_telegram(regular_user, target=TelegramDeliveryTarget.FAMILY)
    NotificationPreference.objects.create(
        user=regular_user,
        channel="telegram",
        event_type="board.updated",
        enabled=False,
    )
    sent: list[int] = []
    monkeypatch.setattr(
        "kanban.dispatcher.send_message",
        lambda *, chat_id, text: sent.append(chat_id) or {"message_id": 1},
    )
    _event(regular_user, board)

    dispatcher.process_outbox_events()

    assert FAMILY_CHAT_ID not in sent


# ---------------------------------------------------------------------------
# Личные напоминания всегда в личный чат
# ---------------------------------------------------------------------------


@pytest.mark.django_db()
def test_reminder_goes_to_personal_chat_even_with_family_target(column, monkeypatch) -> None:
    _family_chat()
    user = User.objects.create_user(username="famrem", password="pw")
    _link(user, chat_id=777)
    _set_telegram(user, target=TelegramDeliveryTarget.FAMILY)
    card = Card.objects.create(
        column=column,
        title="Напоминание",
        deadline=timezone.now() + timedelta(hours=2),
    )

    reminder = CardDeadlineReminder.objects.create(
        card=card,
        user=user,
        enabled=True,
        offset_value=180,
        status=CardDeadlineReminder.Status.SCHEDULED,
        scheduled_at=timezone.now() - timedelta(hours=1),
        schedule_token=uuid.uuid4(),
    )
    sent: list[tuple[int, str]] = []
    monkeypatch.setattr(
        "kanban.dispatcher.send_message",
        lambda *, chat_id, text: sent.append((chat_id, text)) or {"message_id": 1},
    )

    dispatcher.process_due_reminders()

    assert len(sent) == 1
    assert sent[0][0] == 777
    assert FAMILY_CHAT_ID not in [chat_id for chat_id, _ in sent]
    reminder.refresh_from_db()
    assert reminder.status == CardDeadlineReminder.Status.SENT


# ---------------------------------------------------------------------------
# Смешанные каналы: группа + личный Telegram + Push не дублируются
# ---------------------------------------------------------------------------


@pytest.mark.django_db()
def test_mixed_channels_deliver_once_each(
    regular_user, board, webpush_settings, monkeypatch
) -> None:
    _family_chat()
    family_user = User.objects.create_user(username="fam", password="pw")
    personal_user = User.objects.create_user(username="pers", password="pw")
    push_user = User.objects.create_user(username="push", password="pw")
    _link(family_user, chat_id=1001)
    _set_telegram(family_user, target=TelegramDeliveryTarget.FAMILY)
    _link(personal_user, chat_id=1002)
    _set_telegram(personal_user, target=TelegramDeliveryTarget.PERSONAL)
    make_push_device(
        push_user,
        kind=PushDevice.Kind.WEBPUSH,
        endpoint="https://push.example.com/2",
    )
    sent: list[int] = []
    push_calls: list[dict] = []
    monkeypatch.setattr(
        "kanban.dispatcher.send_message",
        lambda *, chat_id, text: sent.append(chat_id) or {"message_id": 1},
    )
    monkeypatch.setattr("kanban.webpush.send_webpush", lambda **kwargs: push_calls.append(kwargs))
    event = _event(regular_user, board)

    dispatcher.process_outbox_events()

    assert sent.count(FAMILY_CHAT_ID) == 1
    assert sent.count(1002) == 1
    assert len(push_calls) == 1
    # Group row plus one personal row, no per-user group rows.
    assert NotificationDelivery.objects.filter(event=event, family_chat_id=1).count() == 1
    assert NotificationDelivery.objects.filter(event=event, user=personal_user).count() == 1


# ---------------------------------------------------------------------------
# Смена адресата отменяет личную доставку, но не групповую
# ---------------------------------------------------------------------------


@pytest.mark.django_db()
def test_target_switch_cancels_pending_personal(regular_user, board, monkeypatch) -> None:
    _family_chat()
    _link(regular_user, chat_id=777)
    _set_telegram(regular_user, target=TelegramDeliveryTarget.FAMILY)
    sent: list[int] = []
    monkeypatch.setattr(
        "kanban.dispatcher.send_message",
        lambda *, chat_id, text: sent.append(chat_id) or {"message_id": 1},
    )
    _event(regular_user, board)

    # Switch to personal before the dispatcher runs.
    profile = NotificationProfile.objects.get(user_id=regular_user.id)
    profile.telegram_target = TelegramDeliveryTarget.PERSONAL
    profile.telegram_target_changed_at = timezone.now()
    profile.save(update_fields=["telegram_target", "telegram_target_changed_at"])

    dispatcher.process_outbox_events()

    # Neither the group nor the personal chat received the old event.
    assert sent == []


# ---------------------------------------------------------------------------
# Отключение группы администратором переводит получателей на личный чат
# ---------------------------------------------------------------------------


@pytest.mark.django_db()
def test_admin_disconnect_switches_family_recipients_to_personal(admin_user, regular_user) -> None:
    _family_chat()
    _link(regular_user, chat_id=777)
    _set_telegram(regular_user, target=TelegramDeliveryTarget.FAMILY)

    response = client_for(admin_user).delete(FAMILY_URL)

    assert response.status_code == 204
    assert not FamilyTelegramChat.objects.filter(pk=1).exists()
    profile = NotificationProfile.objects.get(user_id=regular_user.id)
    assert profile.telegram_target == TelegramDeliveryTarget.PERSONAL
    assert profile.telegram_target_reason == "Семейный чат отключён администратором"


@pytest.mark.django_db()
def test_non_admin_cannot_disconnect_family_chat(regular_user) -> None:
    _family_chat()

    response = client_for(regular_user).delete(FAMILY_URL)

    assert response.status_code == 403
    assert FamilyTelegramChat.objects.filter(pk=1).exists()


# ---------------------------------------------------------------------------
# Потеря доступа ботом переводит получателей на личный чат
# ---------------------------------------------------------------------------


@pytest.mark.django_db()
def test_family_chat_lost_switches_recipients_to_personal(regular_user, board, monkeypatch) -> None:
    _family_chat()
    _link(regular_user, chat_id=777)
    _set_telegram(regular_user, target=TelegramDeliveryTarget.FAMILY)

    def losing_send(*, chat_id, text):
        raise TelegramChatLostError("Telegram: Forbidden: bot was kicked")

    monkeypatch.setattr("kanban.dispatcher.send_message", losing_send)
    _event(regular_user, board)

    dispatcher.process_outbox_events()

    assert not FamilyTelegramChat.objects.filter(pk=1).exists()
    profile = NotificationProfile.objects.get(user_id=regular_user.id)
    assert profile.telegram_target == TelegramDeliveryTarget.PERSONAL
    assert profile.telegram_target_reason == "Бот потерял доступ к семейному чату"


@pytest.mark.django_db()
def test_family_transient_error_keeps_target_and_retries(regular_user, board, monkeypatch) -> None:
    _family_chat()
    _link(regular_user, chat_id=777)
    _set_telegram(regular_user, target=TelegramDeliveryTarget.FAMILY)
    calls: list[int] = []

    def failing_send(*, chat_id, text):
        calls.append(chat_id)
        raise TelegramError("Telegram недоступен")

    monkeypatch.setattr("kanban.dispatcher.send_message", failing_send)
    event = _event(regular_user, board)

    dispatcher.process_outbox_events()

    assert calls == [FAMILY_CHAT_ID]
    event.refresh_from_db()
    assert event.dispatch_status == event.Dispatch.PENDING
    # The chat stays connected and the target stays family.
    assert FamilyTelegramChat.objects.filter(pk=1).exists()
    profile = NotificationProfile.objects.get(user_id=regular_user.id)
    assert profile.telegram_target == TelegramDeliveryTarget.FAMILY


# ---------------------------------------------------------------------------
# Отключение личной привязки при выбранной группе включает Push
# ---------------------------------------------------------------------------


@pytest.mark.django_db()
def test_unlink_while_on_family_switches_to_push(auth_client, regular_user) -> None:
    _family_chat()
    _link(regular_user, chat_id=777)
    _set_telegram(regular_user, target=TelegramDeliveryTarget.FAMILY)

    response = auth_client.delete("/api/v1/notifications/telegram/")

    assert response.status_code == 204
    profile = NotificationProfile.objects.get(user_id=regular_user.id)
    assert profile.delivery_channel == PersonalDeliveryChannel.PUSH
    assert profile.telegram_target == TelegramDeliveryTarget.PERSONAL
    # The shared chat itself survives for the other members.
    assert FamilyTelegramChat.objects.filter(pk=1).exists()


# ---------------------------------------------------------------------------
# Смена канала (off -> on) не возобновляет отменённую групповую доставку
# ---------------------------------------------------------------------------


@pytest.mark.django_db()
def test_channel_switch_off_then_on_does_not_resume_group(regular_user, board, monkeypatch) -> None:
    _family_chat()
    _link(regular_user, chat_id=777)
    _set_telegram(regular_user, target=TelegramDeliveryTarget.FAMILY)
    sent: list[int] = []
    monkeypatch.setattr(
        "kanban.dispatcher.send_message",
        lambda *, chat_id, text: sent.append(chat_id) or {"message_id": 1},
    )
    _event(regular_user, board)

    # Telegram -> disabled -> Telegram family: the pending event was cancelled
    # by the channel switch and must not be resumed.
    profile = NotificationProfile.objects.get(user_id=regular_user.id)
    profile.delivery_channel = PersonalDeliveryChannel.DISABLED
    profile.delivery_channel_changed_at = timezone.now()
    profile.save(update_fields=["delivery_channel", "delivery_channel_changed_at"])
    profile.delivery_channel = PersonalDeliveryChannel.TELEGRAM
    profile.delivery_channel_changed_at = timezone.now()
    profile.telegram_target = TelegramDeliveryTarget.FAMILY
    profile.save(
        update_fields=["delivery_channel", "delivery_channel_changed_at", "telegram_target"]
    )

    dispatcher.process_outbox_events()

    assert sent == []
    assert not NotificationDelivery.objects.filter(event__board=board, family_chat_id=1).exists()


@pytest.mark.django_db()
def test_one_recipient_switch_keeps_group_for_others(regular_user, board, monkeypatch) -> None:
    _family_chat()
    other = User.objects.create_user(username="fam2", password="pw")
    _link(regular_user, chat_id=1001)
    _link(other, chat_id=1002)
    _set_telegram(regular_user, target=TelegramDeliveryTarget.FAMILY)
    _set_telegram(other, target=TelegramDeliveryTarget.FAMILY)
    sent: list[int] = []
    monkeypatch.setattr(
        "kanban.dispatcher.send_message",
        lambda *, chat_id, text: sent.append(chat_id) or {"message_id": 1},
    )
    _event(regular_user, board)

    # One recipient switches away; the group message stays for the other.
    profile = NotificationProfile.objects.get(user_id=regular_user.id)
    profile.delivery_channel = PersonalDeliveryChannel.DISABLED
    profile.delivery_channel_changed_at = timezone.now()
    profile.save(update_fields=["delivery_channel", "delivery_channel_changed_at"])

    dispatcher.process_outbox_events()

    assert sent == [FAMILY_CHAT_ID]


# ---------------------------------------------------------------------------
# Потеря доступа не удаляет переподключённую группу
# ---------------------------------------------------------------------------


@pytest.mark.django_db()
def test_chat_lost_error_preserves_reconnected_chat(regular_user, board, monkeypatch) -> None:
    _family_chat()
    _link(regular_user, chat_id=777)
    _set_telegram(regular_user, target=TelegramDeliveryTarget.FAMILY)

    def send_then_reconnect(*, chat_id: int, text: str) -> dict:
        # While the send was in flight, the admin connected a different group B.
        FamilyTelegramChat.objects.filter(pk=1).update(
            chat_id=-100200, title="B", confirmed_at=timezone.now() + timedelta(seconds=5)
        )
        raise TelegramChatLostError("Telegram: Forbidden: bot was kicked", status=403)

    monkeypatch.setattr("kanban.dispatcher.send_message", send_then_reconnect)
    _event(regular_user, board)

    dispatcher.process_outbox_events()

    # The stale error for A must not delete B nor re-home B's recipients.
    survived = FamilyTelegramChat.objects.get(pk=1)
    assert survived.chat_id == -100200
    profile = NotificationProfile.objects.get(user_id=regular_user.id)
    assert profile.telegram_target == TelegramDeliveryTarget.FAMILY
    assert profile.telegram_target_reason == ""
