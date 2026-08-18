from __future__ import annotations

import pytest
from django.contrib.auth import get_user_model

from kanban.models import PushDevice

User = get_user_model()


SUBSCRIPTION = {
    "endpoint": "https://push.example.com/sub",
    "keys": {"p256dh": "p256dh-key", "auth": "auth-key"},
    "label": "Chrome на Android",
}


@pytest.mark.django_db()
def test_register_device_creates_record(auth_client, regular_user) -> None:
    resp = auth_client.post("/api/v1/push-devices/", data=SUBSCRIPTION, format="json")

    assert resp.status_code == 201
    assert PushDevice.objects.filter(user=regular_user, active=True).count() == 1


@pytest.mark.django_db()
def test_reregister_same_endpoint_updates_instead_of_duplicating(
    auth_client, regular_user
) -> None:
    auth_client.post("/api/v1/push-devices/", data=SUBSCRIPTION, format="json")
    resp = auth_client.post("/api/v1/push-devices/", data=SUBSCRIPTION, format="json")

    assert resp.status_code == 200
    assert PushDevice.objects.filter(user=regular_user).count() == 1


@pytest.mark.django_db()
def test_reregister_reactivates_a_retired_device(auth_client, regular_user) -> None:
    created = auth_client.post("/api/v1/push-devices/", data=SUBSCRIPTION, format="json").json()
    PushDevice.objects.filter(pk=created["id"]).update(active=False)

    auth_client.post("/api/v1/push-devices/", data=SUBSCRIPTION, format="json")

    device = PushDevice.objects.get(pk=created["id"])
    assert device.active is True


@pytest.mark.django_db()
def test_list_never_returns_secrets(auth_client, regular_user) -> None:
    auth_client.post("/api/v1/push-devices/", data=SUBSCRIPTION, format="json")

    resp = auth_client.get("/api/v1/push-devices/")

    assert resp.status_code == 200
    assert len(resp.json()) == 1
    for field in ("endpoint", "p256dh", "auth", "token"):
        assert field not in resp.json()[0]


@pytest.mark.django_db()
def test_revoke_other_users_device_is_not_found(auth_client, regular_user) -> None:
    other = User.objects.create_user(username="user2", password="pw")
    device = PushDevice.objects.create(
        user=other,
        kind=PushDevice.Kind.WEBPUSH,
        endpoint="https://push.example.com/other",
        p256dh="p256dh-key",
        auth="auth-key",
    )

    resp = auth_client.delete(f"/api/v1/push-devices/{device.id}/")

    assert resp.status_code == 404
    assert PushDevice.objects.filter(pk=device.id).exists()


@pytest.mark.django_db()
def test_test_send_reports_no_devices_separately(auth_client, regular_user) -> None:
    resp = auth_client.post("/api/v1/push-devices/test/")

    assert resp.status_code == 502
    payload = resp.json()
    assert payload["delivered"] is False
    assert payload["no_devices"] is True


@pytest.mark.django_db()
def test_vapid_key_reports_configured(auth_client, webpush_settings) -> None:
    resp = auth_client.get("/api/v1/notifications/vapid-key/")

    assert resp.status_code == 200
    payload = resp.json()
    assert payload["public_key"] == "test-public"
    assert payload["configured"] is True


@pytest.mark.django_db()
def test_vapid_key_reports_not_configured(auth_client, settings) -> None:
    settings.VAPID_PUBLIC_KEY = ""
    settings.VAPID_PRIVATE_KEY = ""
    settings.VAPID_CLAIM_EMAIL = ""

    resp = auth_client.get("/api/v1/notifications/vapid-key/")

    assert resp.status_code == 200
    assert resp.json()["configured"] is False
