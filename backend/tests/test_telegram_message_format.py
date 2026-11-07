from datetime import timedelta

import pytest
from django.utils import timezone

from kanban import dispatcher, telegram
from kanban.models import (
    Card,
    CardDeadlineReminder,
    FamilyTelegramChat,
    NotificationProfile,
    PersonalDeliveryChannel,
    TelegramAccount,
    TelegramDeliveryTarget,
)
from kanban.notifications import create_notification_event


@pytest.mark.django_db()
@pytest.mark.parametrize("family", [False, True])
def test_event_message_has_one_summary_and_no_duplicate_task(
    regular_user, column, monkeypatch, family
) -> None:
    regular_user.first_name = "Александр"
    regular_user.save(update_fields=["first_name"])
    card = Card.objects.create(column=column, title="Купить продукты")
    TelegramAccount.objects.create(user=regular_user, chat_id=123)
    profile, _ = NotificationProfile.objects.get_or_create(user=regular_user)
    profile.delivery_channel = PersonalDeliveryChannel.TELEGRAM
    profile.delivery_channel_changed_at = timezone.now() - timedelta(hours=1)
    profile.telegram_target = (
        TelegramDeliveryTarget.FAMILY if family else TelegramDeliveryTarget.PERSONAL
    )
    profile.save()
    if family:
        FamilyTelegramChat.objects.create(pk=1, chat_id=-123, title="Семья")
    event = create_notification_event(
        event_type="card.completed",
        actor=regular_user,
        board=card.board,
        card=card,
        summary=f"Задача «{card.title}» выполнена",
        payload={"board": card.board.name, "card": card.title},
    )
    sent = []
    monkeypatch.setattr(
        dispatcher, "send_message", lambda **kwargs: sent.append(kwargs) or {"message_id": 1}
    )

    if family:
        dispatcher._deliver_event_to_family_chat(event, [regular_user.id])
    else:
        dispatcher._deliver_event_to_telegram(event, regular_user.id)

    assert sent[0]["text"] == (
        f"Александр: Задача «{card.title}» выполнена\nСписок: {card.board.name}\n{event.link}"
    )


@pytest.mark.django_db()
def test_telegram_reminder_keeps_task_deadline_and_link_only(regular_user, column, monkeypatch):
    TelegramAccount.objects.create(user=regular_user, chat_id=123)
    NotificationProfile.objects.get_or_create(user=regular_user, defaults={"timezone": "UTC"})
    card = Card.objects.create(
        column=column, title="Купить продукты", deadline=timezone.now() + timedelta(hours=2)
    )
    reminder = CardDeadlineReminder.objects.create(card=card, user=regular_user)
    subject, body, link = dispatcher._reminder_message(reminder, card)
    sent = []
    monkeypatch.setattr(
        dispatcher, "send_message", lambda **kwargs: sent.append(kwargs) or {"message_id": 1}
    )

    dispatcher._deliver_reminder_on_channel(
        reminder=reminder, card=card, channel="telegram", subject=subject, body=body, link=link
    )

    assert sent[0]["text"] == (
        f"Напоминание: {card.title}\nСрок: {card.deadline:%d.%m.%Y %H:%M}\n{link}"
    )


def test_telegram_messages_disable_link_preview(monkeypatch):
    payloads = []
    monkeypatch.setattr(
        telegram, "_request", lambda method, payload: payloads.append(payload) or {}
    )

    telegram.send_message(chat_id=123, text="Событие\nhttps://example.com/task")

    assert payloads[0]["link_preview_options"] == {"is_disabled": True}
