from __future__ import annotations

import pytest

from kanban.models import NotificationInboxEntry
from kanban.notifications import create_notification_event
from kanban.tasks import send_notification_event


@pytest.mark.django_db()
def test_notification_inbox_api_lists_and_marks_read(auth_client, regular_user, board) -> None:
    event = create_notification_event(
        event_type="board.updated",
        actor=regular_user,
        board=board,
        summary='Обновлена доска "Дом"',
        payload={"board": board.name},
    )

    send_notification_event.run(event.id)

    response = auth_client.get("/api/v1/notifications/inbox/")
    assert response.status_code == 200
    payload = response.json()
    assert payload["unread_count"] == 1
    assert len(payload["results"]) == 1

    item = payload["results"][0]
    assert item["event_id"] == event.id
    assert item["unread"] is True
    assert item["route"] == f"/boards/{board.id}"

    mark_response = auth_client.patch(
        "/api/v1/notifications/inbox/",
        data={"ids": [item["id"]]},
        format="json",
    )
    assert mark_response.status_code == 200
    assert mark_response.json()["updated"] == 1

    inbox_entry = NotificationInboxEntry.objects.get(pk=item["id"])
    assert inbox_entry.read_at is not None
