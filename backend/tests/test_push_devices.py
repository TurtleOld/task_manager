from __future__ import annotations

from datetime import timedelta

import pytest
import requests
from django.contrib.auth import get_user_model
from django.utils import timezone
from pywebpush import WebPushException

from kanban.models import Card, CardDeadlineReminder, NotificationProfile, PushDevice
from kanban.reminders import upsert_and_schedule_reminder

User = get_user_model()


def _subscription(endpoint: str, *, label: str = "") -> dict:
    payload = {
        "endpoint": endpoint,
        "keys": {"p256dh": "p256dh-key", "auth": "auth-key"},
    }
    if label:
        payload["label"] = label
    return payload


SUBSCRIPTION = _subscription(
    "https://fcm.googleapis.com/fcm/send/sub",
    label="Chrome на Android",
)


@pytest.mark.django_db()
@pytest.mark.parametrize(
    "endpoint",
    [
        "http://fcm.googleapis.com/fcm/send/sub",
        "https://evil.example.com/sub",
        "https://fcm.googleapis.com.evil.example/sub",
        "https://127.0.0.1/sub",
        "https://dispatcher:8000/sub",
    ],
)
def test_register_rejects_endpoint_outside_allowlist(auth_client, endpoint) -> None:
    resp = auth_client.post("/api/v1/push-devices/", data=_subscription(endpoint), format="json")

    assert resp.status_code == 400
    assert "endpoint" in resp.json()


@pytest.mark.django_db()
@pytest.mark.parametrize(
    "endpoint",
    [
        "https://fcm.googleapis.com/fcm/send/sub",
        "https://wns2-par02p.notify.windows.com/w/?token=x",
        "https://updates.push.services.mozilla.com/wpush/v2/x",
    ],
)
def test_register_accepts_known_push_service_hosts(auth_client, endpoint) -> None:
    resp = auth_client.post("/api/v1/push-devices/", data=_subscription(endpoint), format="json")

    assert resp.status_code == 201


@pytest.mark.django_db()
def test_register_device_creates_record(auth_client, regular_user) -> None:
    resp = auth_client.post("/api/v1/push-devices/", data=SUBSCRIPTION, format="json")

    assert resp.status_code == 201
    assert PushDevice.objects.filter(user=regular_user, active=True).count() == 1


@pytest.mark.django_db()
def test_reregister_same_endpoint_updates_instead_of_duplicating(auth_client, regular_user) -> None:
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
def test_registering_device_reschedules_stranded_reminder(
    auth_client, regular_user, column
) -> None:
    NotificationProfile.objects.update_or_create(user=regular_user, defaults={})
    card = Card.objects.create(
        column=column,
        title="Waiting for a device",
        deadline=timezone.now() + timedelta(days=1),
    )
    reminder = CardDeadlineReminder.objects.create(
        card=card,
        user=regular_user,
        enabled=True,
        offset_value=20,
    )
    upsert_and_schedule_reminder(card=card, reminder=reminder)
    reminder.refresh_from_db()
    assert reminder.status == CardDeadlineReminder.Status.INVALID_CHANNEL

    resp = auth_client.post("/api/v1/push-devices/", data=SUBSCRIPTION, format="json")

    assert resp.status_code == 201
    reminder.refresh_from_db()
    assert reminder.status == CardDeadlineReminder.Status.SCHEDULED


@pytest.mark.django_db()
def test_test_send_does_not_reflect_push_service_body(
    auth_client, webpush_settings, monkeypatch
) -> None:
    auth_client.post("/api/v1/push-devices/", data=SUBSCRIPTION, format="json")

    def fake_webpush(**_kwargs):
        response = requests.Response()
        response.status_code = 500
        response._content = b"INTERNAL-SECRET-BODY"
        raise WebPushException("boom", response=response)

    monkeypatch.setattr("pywebpush.webpush", fake_webpush)

    resp = auth_client.post("/api/v1/push-devices/test/")

    assert resp.status_code == 502
    assert "INTERNAL-SECRET-BODY" not in resp.text
    device = PushDevice.objects.get()
    assert "INTERNAL-SECRET-BODY" not in device.last_error


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
