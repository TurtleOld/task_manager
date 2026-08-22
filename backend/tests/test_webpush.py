from __future__ import annotations

import pytest
import requests
from pywebpush import WebPushException

from kanban.webpush import (
    PushDeliveryError,
    PushSubscriptionGoneError,
    send_webpush,
)

pytestmark = pytest.mark.django_db()


def _subscription_kwargs() -> dict:
    return {
        "endpoint": "https://push.example/x",
        "p256dh": "key",
        "auth": "secret",
        "payload": "{}",
    }


def test_send_webpush_retries_once_on_read_timeout_then_succeeds(webpush_settings, monkeypatch):
    calls: list[int] = []

    def fake_webpush(**kwargs):
        calls.append(kwargs["timeout"])
        if len(calls) == 1:
            raise requests.exceptions.ReadTimeout("Read timed out. (read timeout=10)")

    monkeypatch.setattr("pywebpush.webpush", fake_webpush)

    send_webpush(**_subscription_kwargs())

    assert calls == [10, 20]


def test_send_webpush_raises_after_exhausting_retries_on_persistent_timeout(
    webpush_settings, monkeypatch
):
    def fake_webpush(**kwargs):
        raise requests.exceptions.ReadTimeout("Read timed out.")

    monkeypatch.setattr("pywebpush.webpush", fake_webpush)

    with pytest.raises(PushDeliveryError):
        send_webpush(**_subscription_kwargs())


def test_send_webpush_does_not_retry_a_real_http_error(webpush_settings, monkeypatch):
    calls: list[int] = []

    def fake_webpush(**kwargs):
        calls.append(kwargs["timeout"])
        response = requests.Response()
        response.status_code = 500
        raise WebPushException("boom", response=response)

    monkeypatch.setattr("pywebpush.webpush", fake_webpush)

    with pytest.raises(PushDeliveryError):
        send_webpush(**_subscription_kwargs())

    assert calls == [10]


def test_send_webpush_passes_ttl_and_urgency(webpush_settings, monkeypatch):
    calls: list[dict] = []

    def fake_webpush(**kwargs):
        calls.append(kwargs)

    monkeypatch.setattr("pywebpush.webpush", fake_webpush)

    send_webpush(**_subscription_kwargs())

    assert calls[0]["ttl"] == webpush_settings.WEBPUSH_TTL_SECONDS
    assert calls[0]["headers"] == {"Urgency": webpush_settings.WEBPUSH_URGENCY}


def test_send_webpush_retires_subscription_on_410(webpush_settings, monkeypatch):
    def fake_webpush(**kwargs):
        response = requests.Response()
        response.status_code = 410
        raise WebPushException("gone", response=response)

    monkeypatch.setattr("pywebpush.webpush", fake_webpush)

    with pytest.raises(PushSubscriptionGoneError):
        send_webpush(**_subscription_kwargs())
