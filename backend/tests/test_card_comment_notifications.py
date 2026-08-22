from __future__ import annotations

import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from kanban import dispatcher
from kanban.models import (
    Board,
    Card,
    NotificationEvent,
    NotificationEventType,
    NotificationInboxEntry,
    PushDevice,
)
from kanban.notifications import create_notification_event

User = get_user_model()


def _device(user: User) -> PushDevice:
    return PushDevice.objects.create(
        user=user,
        kind=PushDevice.Kind.WEBPUSH,
        endpoint=f"https://push.example.com/{user.id}",
        p256dh="p256dh-key",
        auth="auth-key",
    )


@pytest.mark.django_db()
def test_comment_without_mention_creates_one_event_without_mention_user_ids(
    auth_client: APIClient, regular_user: User, board: Board, card: Card
) -> None:
    resp = auth_client.post(
        f"/api/v1/cards/{card.id}/comments/",
        data={"text": "Просто комментарий без упоминаний"},
        format="json",
    )
    assert resp.status_code == 201

    events = NotificationEvent.objects.filter(
        event_type=NotificationEventType.COMMENT_CREATED, card=card
    )
    assert events.count() == 1
    assert "mention_user_ids" not in events.first().payload


@pytest.mark.django_db()
def test_comment_without_mention_addresses_everyone_but_the_author(
    auth_client: APIClient, regular_user: User, board: Board, card: Card
) -> None:
    other = User.objects.create_user(username="user2", password="pw")

    resp = auth_client.post(
        f"/api/v1/cards/{card.id}/comments/",
        data={"text": "Комментарий без упоминаний"},
        format="json",
    )
    assert resp.status_code == 201

    event = NotificationEvent.objects.get(
        event_type=NotificationEventType.COMMENT_CREATED, card=card
    )
    recipients = set(dispatcher._event_recipients(event))
    assert recipients == {other.id}
    assert regular_user.id not in recipients


@pytest.mark.django_db()
def test_comment_without_mention_pushes_other_devices_but_not_the_authors(
    auth_client: APIClient,
    regular_user: User,
    board: Board,
    card: Card,
    webpush_settings,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    other = User.objects.create_user(username="user2", password="pw")
    author_device = _device(regular_user)
    other_device = _device(other)

    sent: list[str] = []
    monkeypatch.setattr(
        "kanban.webpush.send_webpush",
        lambda *, endpoint, **_kwargs: sent.append(endpoint),
    )

    resp = auth_client.post(
        f"/api/v1/cards/{card.id}/comments/",
        data={"text": "Комментарий без упоминаний"},
        format="json",
    )
    assert resp.status_code == 201

    dispatcher.process_outbox_events()

    assert author_device.endpoint not in sent
    assert other_device.endpoint in sent


@pytest.mark.django_db()
def test_comment_without_mention_skips_authors_inbox_entry(
    auth_client: APIClient, regular_user: User, board: Board, card: Card
) -> None:
    other = User.objects.create_user(username="user2", password="pw")

    resp = auth_client.post(
        f"/api/v1/cards/{card.id}/comments/",
        data={"text": "Комментарий без упоминаний"},
        format="json",
    )
    assert resp.status_code == 201

    event = NotificationEvent.objects.get(
        event_type=NotificationEventType.COMMENT_CREATED, card=card
    )
    dispatcher.process_outbox_events()

    recipients = set(
        NotificationInboxEntry.objects.filter(event=event).values_list("user_id", flat=True)
    )
    assert recipients == {other.id}


@pytest.mark.django_db()
def test_comment_with_mention_still_creates_exactly_one_event(
    auth_client: APIClient, regular_user: User, board: Board, card: Card
) -> None:
    mentioned = User.objects.create_user(username="user2", password="pw")

    resp = auth_client.post(
        f"/api/v1/cards/{card.id}/comments/",
        data={"text": f"Привет @{mentioned.username}"},
        format="json",
    )
    assert resp.status_code == 201

    events = NotificationEvent.objects.filter(
        event_type=NotificationEventType.COMMENT_CREATED, card=card
    )
    assert events.count() == 1
    event = events.first()
    assert event.payload["mention_user_ids"] == [mentioned.id]

    recipients = set(dispatcher._event_recipients(event))
    assert recipients == {mentioned.id}


@pytest.mark.django_db()
def test_actors_device_gets_card_completed_but_not_comment_created(
    regular_user: User, board: Board, card: Card, webpush_settings, monkeypatch: pytest.MonkeyPatch
) -> None:
    """The exact boundary a simplifying edit is likely to erase by accident."""

    _device(regular_user)

    sent: list[str] = []
    monkeypatch.setattr(
        "kanban.webpush.send_webpush",
        lambda *, endpoint, **_kwargs: sent.append(endpoint),
    )

    create_notification_event(
        event_type=NotificationEventType.CARD_COMPLETED,
        actor=regular_user,
        board=board,
        card=card,
        summary="Задача выполнена",
    )
    dispatcher.process_outbox_events()
    assert sent == [f"https://push.example.com/{regular_user.id}"]

    sent.clear()
    create_notification_event(
        event_type=NotificationEventType.COMMENT_CREATED,
        actor=regular_user,
        board=board,
        card=card,
        summary="Новый комментарий",
        payload={"board": board.name, "card": card.title, "comment": "hi"},
    )
    dispatcher.process_outbox_events()
    assert sent == []
