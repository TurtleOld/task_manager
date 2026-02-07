from __future__ import annotations

import pytest
from rest_framework.test import APIClient

from kanban.models import NotificationEvent


@pytest.fixture(autouse=True)
def _disable_celery_delay(monkeypatch: pytest.MonkeyPatch) -> None:
    """Avoid broker/network in tests: make Celery `.delay()` a no-op."""

    class _DummyTask:
        def delay(self, *_args: object, **_kwargs: object) -> None:  # noqa: D401
            return None

    import kanban.notifications as notifications

    monkeypatch.setattr(notifications, "send_notification_event", _DummyTask())


@pytest.mark.django_db()
def test_update_does_not_auto_notify_and_notify_is_idempotent() -> None:
    client = APIClient()

    board = client.post("/api/v1/boards/", data={"name": "B"}, format="json").json()
    col = client.post(
        "/api/v1/columns/",
        data={"board": board["id"], "name": "Todo"},
        format="json",
    ).json()
    card = client.post(
        "/api/v1/cards/",
        data={"column": col["id"], "title": "A"},
        format="json",
    ).json()

    updated = client.patch(
        f"/api/v1/cards/{card['id']}/",
        data={"title": "A2"},
        format="json",
    )
    assert updated.status_code == 200
    card_updated = updated.json()
    version = card_updated["version"]

    assert (
        NotificationEvent.objects.filter(event_type="card.updated", card_id=card["id"]).count() == 0
    )

    # Explicit notify -> exactly one event
    n1 = client.post(
        f"/api/v1/cards/{card['id']}/notify-updated/",
        data={"version": version},
        format="json",
    )
    assert n1.status_code == 200
    assert (
        NotificationEvent.objects.filter(event_type="card.updated", card_id=card["id"]).count() == 1
    )
    first_event_id = n1.json()["event_id"]

    # Retry with same version must not create duplicates
    n2 = client.post(
        f"/api/v1/cards/{card['id']}/notify-updated/",
        data={"version": version},
        format="json",
    )
    assert n2.status_code == 200
    assert n2.json()["event_id"] == first_event_id
    assert (
        NotificationEvent.objects.filter(event_type="card.updated", card_id=card["id"]).count() == 1
    )


@pytest.mark.django_db()
def test_failed_save_does_not_create_notification_event() -> None:
    client = APIClient()

    board = client.post("/api/v1/boards/", data={"name": "B"}, format="json").json()
    col = client.post(
        "/api/v1/columns/",
        data={"board": board["id"], "name": "Todo"},
        format="json",
    ).json()
    card = client.post(
        "/api/v1/cards/",
        data={"column": col["id"], "title": "A"},
        format="json",
    ).json()

    resp = client.patch(
        f"/api/v1/cards/{card['id']}/",
        data={"title": ""},
        format="json",
    )
    assert resp.status_code == 400
    assert (
        NotificationEvent.objects.filter(event_type="card.updated", card_id=card["id"]).count() == 0
    )


@pytest.mark.django_db()
def test_notify_error_does_not_rollback_save() -> None:
    client = APIClient()

    board = client.post("/api/v1/boards/", data={"name": "B"}, format="json").json()
    col = client.post(
        "/api/v1/columns/",
        data={"board": board["id"], "name": "Todo"},
        format="json",
    ).json()
    card = client.post(
        "/api/v1/cards/",
        data={"column": col["id"], "title": "A"},
        format="json",
    ).json()

    updated = client.patch(
        f"/api/v1/cards/{card['id']}/",
        data={"title": "A2"},
        format="json",
    )
    assert updated.status_code == 200
    version = updated.json()["version"]

    # Wrong version -> 409
    notify = client.post(
        f"/api/v1/cards/{card['id']}/notify-updated/",
        data={"version": version - 1},
        format="json",
    )
    assert notify.status_code == 409

    # Card is still updated
    loaded = client.get(f"/api/v1/cards/{card['id']}/")
    assert loaded.status_code == 200
    assert loaded.json()["title"] == "A2"
    assert (
        NotificationEvent.objects.filter(event_type="card.updated", card_id=card["id"]).count() == 0
    )


@pytest.mark.django_db()
def test_delete_does_not_auto_notify_and_deleted_notify_is_idempotent() -> None:
    client = APIClient()

    board = client.post("/api/v1/boards/", data={"name": "B"}, format="json").json()
    col = client.post(
        "/api/v1/columns/",
        data={"board": board["id"], "name": "Todo"},
        format="json",
    ).json()
    card = client.post(
        "/api/v1/cards/",
        data={"column": col["id"], "title": "A"},
        format="json",
    ).json()

    version = card["version"]
    resp = client.delete(f"/api/v1/cards/{card['id']}/")
    assert resp.status_code in {200, 204}
    assert (
        NotificationEvent.objects.filter(event_type="card.deleted").count() == 0
    )

    payload = {
        "card_id": card["id"],
        "version": version,
        "board": board["id"],
        "column": col["id"],
        "card_title": card["title"],
    }
    n1 = client.post("/api/v1/cards/notify-deleted/", data=payload, format="json")
    assert n1.status_code == 200
    assert NotificationEvent.objects.filter(event_type="card.deleted").count() == 1
    first_event_id = n1.json()["event_id"]

    n2 = client.post("/api/v1/cards/notify-deleted/", data=payload, format="json")
    assert n2.status_code == 200
    assert n2.json()["event_id"] == first_event_id
    assert NotificationEvent.objects.filter(event_type="card.deleted").count() == 1

