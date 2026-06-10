from __future__ import annotations

import pytest
from django.db import IntegrityError
from rest_framework.test import APIClient

from kanban.models import NotificationPreference


@pytest.mark.django_db()
def test_create_preference(auth_client: APIClient, regular_user: object) -> None:
    resp = auth_client.post(
        "/api/v1/notification-preferences/",
        data={"board": None, "channel": "push", "event_type": "card.updated", "enabled": True},
        format="json",
    )

    assert resp.status_code == 201
    assert NotificationPreference.objects.filter(user=regular_user).count() == 1


@pytest.mark.django_db()
def test_duplicate_create_returns_existing(auth_client: APIClient, regular_user: object) -> None:
    first = auth_client.post(
        "/api/v1/notification-preferences/",
        data={"board": None, "channel": "push", "event_type": "card.updated", "enabled": True},
        format="json",
    )
    second = auth_client.post(
        "/api/v1/notification-preferences/",
        data={"board": None, "channel": "push", "event_type": "card.updated", "enabled": False},
        format="json",
    )

    assert first.status_code == 201
    assert second.status_code == 200
    assert second.json()["id"] == first.json()["id"]
    assert NotificationPreference.objects.filter(user=regular_user).count() == 1
    assert NotificationPreference.objects.get(user=regular_user).enabled is False


@pytest.mark.django_db()
def test_global_preference_unique_constraint(regular_user: object) -> None:
    NotificationPreference.objects.create(
        user=regular_user, board=None, channel="push", event_type="card.updated", enabled=True
    )

    with pytest.raises(IntegrityError):
        NotificationPreference.objects.create(
            user=regular_user, board=None, channel="push", event_type="card.updated", enabled=True
        )
