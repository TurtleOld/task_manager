from __future__ import annotations

import pytest
from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework.authtoken.models import Token
from rest_framework.test import APIClient

from kanban import dispatcher
from kanban.models import NotificationEvent

User = get_user_model()


def _client_for(user) -> APIClient:
    client = APIClient()
    token, _ = Token.objects.get_or_create(user=user)
    client.credentials(HTTP_AUTHORIZATION=f"Token {token.key}")
    return client


@pytest.mark.django_db()
def test_edits_in_one_session_coalesce_into_one_event(auth_client: APIClient) -> None:
    board = auth_client.post("/api/v1/boards/", data={"name": "B"}, format="json").json()
    card = auth_client.post(
        "/api/v1/cards/",
        data={"board": board["id"], "title": "A"},
        format="json",
    ).json()

    first = auth_client.patch(
        f"/api/v1/cards/{card['id']}/", data={"title": "A2"}, format="json"
    )
    assert first.status_code == 200
    event = NotificationEvent.objects.get(event_type="card.updated", card_id=card["id"])
    first_ready_at = event.next_attempt_at

    second = auth_client.patch(
        f"/api/v1/cards/{card['id']}/", data={"description": "details"}, format="json"
    )
    assert second.status_code == 200

    assert NotificationEvent.objects.filter(
        event_type="card.updated", card_id=card["id"]
    ).count() == 1
    event.refresh_from_db()
    assert event.next_attempt_at >= first_ready_at


@pytest.mark.django_db()
def test_two_actors_editing_the_same_card_get_separate_events(
    auth_client: APIClient, regular_user
) -> None:
    other_user = User.objects.create_user(username="user2", password="pass2")
    other_client = _client_for(other_user)

    board = auth_client.post("/api/v1/boards/", data={"name": "B"}, format="json").json()
    card = auth_client.post(
        "/api/v1/cards/",
        data={"board": board["id"], "title": "A"},
        format="json",
    ).json()

    auth_client.patch(f"/api/v1/cards/{card['id']}/", data={"title": "A2"}, format="json")
    other_client.patch(f"/api/v1/cards/{card['id']}/", data={"title": "A3"}, format="json")

    events = NotificationEvent.objects.filter(event_type="card.updated", card_id=card["id"])
    assert events.count() == 2
    assert set(events.values_list("actor_id", flat=True)) == {regular_user.id, other_user.id}
    assert len({e.dedupe_key for e in events}) == 2


@pytest.mark.django_db()
def test_flush_makes_the_pending_event_due_and_dispatchable(auth_client: APIClient) -> None:
    board = auth_client.post("/api/v1/boards/", data={"name": "B"}, format="json").json()
    card = auth_client.post(
        "/api/v1/cards/",
        data={"board": board["id"], "title": "A"},
        format="json",
    ).json()
    auth_client.patch(f"/api/v1/cards/{card['id']}/", data={"title": "A2"}, format="json")

    resp = auth_client.post(f"/api/v1/cards/{card['id']}/notify-updated/")
    assert resp.status_code == 200

    # `process_outbox_events` also picks up `board.created`/`card.created`
    # from the setup calls above — only the flushed event's own state matters.
    dispatcher.process_outbox_events()
    event = NotificationEvent.objects.get(event_type="card.updated", card_id=card["id"])
    assert event.dispatch_status == NotificationEvent.Dispatch.DONE


@pytest.mark.django_db()
def test_dispatched_event_is_finalized_and_next_edit_starts_a_new_one(
    auth_client: APIClient,
) -> None:
    board = auth_client.post("/api/v1/boards/", data={"name": "B"}, format="json").json()
    card = auth_client.post(
        "/api/v1/cards/",
        data={"board": board["id"], "title": "A"},
        format="json",
    ).json()

    auth_client.patch(f"/api/v1/cards/{card['id']}/", data={"title": "A2"}, format="json")
    auth_client.post(f"/api/v1/cards/{card['id']}/notify-updated/")
    dispatcher.process_outbox_events()

    sent_event = NotificationEvent.objects.get(event_type="card.updated", card_id=card["id"])
    assert sent_event.dispatch_status == NotificationEvent.Dispatch.DONE
    assert sent_event.dedupe_key is None

    auth_client.patch(f"/api/v1/cards/{card['id']}/", data={"title": "A3"}, format="json")

    events = NotificationEvent.objects.filter(event_type="card.updated", card_id=card["id"])
    assert events.count() == 2
    new_event = events.exclude(id=sent_event.id).get()
    assert new_event.dispatch_status == NotificationEvent.Dispatch.PENDING
    assert new_event.dedupe_key is not None


@pytest.mark.django_db()
def test_pending_event_not_yet_due_is_skipped_by_the_dispatcher(auth_client: APIClient) -> None:
    board = auth_client.post("/api/v1/boards/", data={"name": "B"}, format="json").json()
    card = auth_client.post(
        "/api/v1/cards/",
        data={"board": board["id"], "title": "A"},
        format="json",
    ).json()
    auth_client.patch(f"/api/v1/cards/{card['id']}/", data={"title": "A2"}, format="json")

    dispatcher.process_outbox_events(now=timezone.now())
    event = NotificationEvent.objects.get(event_type="card.updated", card_id=card["id"])
    assert event.dispatch_status == NotificationEvent.Dispatch.PENDING


@pytest.mark.django_db()
def test_deleting_an_attachment_creates_a_pending_update_event(auth_client: APIClient) -> None:
    board = auth_client.post("/api/v1/boards/", data={"name": "B"}, format="json").json()
    card = auth_client.post(
        "/api/v1/cards/",
        data={"board": board["id"], "title": "A"},
        format="json",
    ).json()
    attachment = auth_client.post(
        f"/api/v1/cards/{card['id']}/attachments/",
        data={"type": "link", "url": "https://example.com", "name": "Example"},
        format="json",
    ).json()["attachments"][-1]

    resp = auth_client.delete(
        f"/api/v1/cards/{card['id']}/attachments/{attachment['id']}/"
    )
    assert resp.status_code == 200
    # One coalesced event covers both the add and the delete — same actor,
    # same open window.
    assert (
        NotificationEvent.objects.filter(event_type="card.updated", card_id=card["id"]).count() == 1
    )


@pytest.mark.django_db()
def test_adding_a_subtask_notes_a_pending_update_on_the_parent(auth_client: APIClient) -> None:
    board = auth_client.post("/api/v1/boards/", data={"name": "B"}, format="json").json()
    parent = auth_client.post(
        "/api/v1/cards/",
        data={"board": board["id"], "title": "Parent"},
        format="json",
    ).json()

    resp = auth_client.post(
        f"/api/v1/cards/{parent['id']}/subtasks/",
        data={"title": "Child"},
        format="json",
    )
    assert resp.status_code == 201
    assert (
        NotificationEvent.objects.filter(
            event_type="card.updated", card_id=parent["id"]
        ).count()
        == 1
    )


@pytest.mark.django_db()
def test_adding_an_attachment_link_creates_a_pending_update_event(auth_client: APIClient) -> None:
    board = auth_client.post("/api/v1/boards/", data={"name": "B"}, format="json").json()
    card = auth_client.post(
        "/api/v1/cards/",
        data={"board": board["id"], "title": "A"},
        format="json",
    ).json()

    resp = auth_client.post(
        f"/api/v1/cards/{card['id']}/attachments/",
        data={"type": "link", "url": "https://example.com", "name": "Example"},
        format="json",
    )
    assert resp.status_code == 201
    assert (
        NotificationEvent.objects.filter(event_type="card.updated", card_id=card["id"]).count() == 1
    )


@pytest.mark.django_db()
def test_direct_api_call_still_creates_the_event(auth_client: APIClient) -> None:
    """The rule now lives on the server, so bypassing the UI does not skip it."""
    board = auth_client.post("/api/v1/boards/", data={"name": "B"}, format="json").json()
    card = auth_client.post(
        "/api/v1/cards/",
        data={"board": board["id"], "title": "A"},
        format="json",
    ).json()

    resp = auth_client.post(
        f"/api/v1/cards/{card['id']}/checklist/",
        data={"text": "Buy milk"},
        format="json",
    )
    assert resp.status_code == 201
    assert NotificationEvent.objects.filter(
        event_type="card.updated", card_id=card["id"]
    ).count() == 1
