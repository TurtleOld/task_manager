from __future__ import annotations

from datetime import timedelta

import pytest
from django.utils import timezone

from kanban.models import TelegramAccount, TelegramLink

WEBHOOK_URL = "/api/v1/telegram/webhook/"
SECRET_HEADER = "HTTP_X_TELEGRAM_BOT_API_SECRET_TOKEN"


def _update(code: str | None, chat_id: int = 777) -> dict:
    message = {
        "text": f"/start {code}" if code else "привет",
        "chat": {"id": chat_id, "type": "private"},
    }
    return {"update_id": 1001, "message": message}


def _link(user, code: str) -> TelegramLink:
    return TelegramLink.objects.create(
        code=code,
        user=user,
        expires_at=timezone.now() + timedelta(minutes=5),
    )


@pytest.mark.django_db()
def test_webhook_rejects_missing_secret(settings, api_client) -> None:
    settings.TELEGRAM_WEBHOOK_SECRET = "secret"
    resp = api_client.post(WEBHOOK_URL, data=_update("code"), format="json")
    assert resp.status_code == 403


@pytest.mark.django_db()
def test_webhook_rejects_wrong_secret(settings, api_client) -> None:
    settings.TELEGRAM_WEBHOOK_SECRET = "secret"
    resp = api_client.post(
        WEBHOOK_URL, data=_update("code"), format="json", **{SECRET_HEADER: "wrong"}
    )
    assert resp.status_code == 403


@pytest.mark.django_db()
def test_webhook_fails_closed_when_secret_empty(settings, api_client, regular_user) -> None:
    settings.TELEGRAM_WEBHOOK_SECRET = ""
    link = _link(regular_user, "code")
    resp = api_client.post(
        WEBHOOK_URL, data=_update("code"), format="json", **{SECRET_HEADER: "anything"}
    )
    assert resp.status_code == 403
    assert not TelegramAccount.objects.filter(user=regular_user).exists()
    assert TelegramLink.objects.get(pk=link.pk).used_at is None


@pytest.mark.django_db()
def test_webhook_confirms_valid_start(settings, api_client, regular_user) -> None:
    settings.TELEGRAM_WEBHOOK_SECRET = "secret"
    _link(regular_user, "CODE-1")

    resp = api_client.post(
        WEBHOOK_URL, data=_update("CODE-1"), format="json", **{SECRET_HEADER: "secret"}
    )

    assert resp.status_code == 200
    account = TelegramAccount.objects.get(user=regular_user)
    assert account.chat_id == 777


@pytest.mark.django_db()
def test_webhook_duplicate_update_is_idempotent(settings, api_client, regular_user) -> None:
    settings.TELEGRAM_WEBHOOK_SECRET = "secret"
    _link(regular_user, "CODE-1")

    first = api_client.post(
        WEBHOOK_URL, data=_update("CODE-1"), format="json", **{SECRET_HEADER: "secret"}
    )
    second = api_client.post(
        WEBHOOK_URL, data=_update("CODE-1"), format="json", **{SECRET_HEADER: "secret"}
    )

    assert first.status_code == 200
    assert second.status_code == 200
    assert TelegramAccount.objects.filter(user=regular_user).count() == 1


@pytest.mark.django_db()
def test_webhook_ignores_non_start_message(settings, api_client, regular_user) -> None:
    settings.TELEGRAM_WEBHOOK_SECRET = "secret"
    resp = api_client.post(
        WEBHOOK_URL,
        data={
            "update_id": 1001,
            "message": {"text": "привет", "chat": {"id": 777, "type": "private"}},
        },
        format="json",
        **{SECRET_HEADER: "secret"},
    )
    assert resp.status_code == 200
    assert not TelegramAccount.objects.filter(user=regular_user).exists()


@pytest.mark.django_db()
def test_webhook_rejects_expired_link_without_retry(settings, api_client, regular_user) -> None:
    settings.TELEGRAM_WEBHOOK_SECRET = "secret"
    TelegramLink.objects.create(
        code="OLD",
        user=regular_user,
        expires_at=timezone.now() - timedelta(seconds=1),
    )

    resp = api_client.post(
        WEBHOOK_URL, data=_update("OLD"), format="json", **{SECRET_HEADER: "secret"}
    )

    assert resp.status_code == 200
    assert not TelegramAccount.objects.filter(user=regular_user).exists()


@pytest.mark.django_db()
def test_webhook_malformed_payload_is_400(settings, api_client) -> None:
    settings.TELEGRAM_WEBHOOK_SECRET = "secret"
    resp = api_client.post(
        WEBHOOK_URL, data={"not": "an update"}, format="json", **{SECRET_HEADER: "secret"}
    )
    assert resp.status_code == 400


@pytest.mark.django_db()
def test_webhook_db_failure_returns_500(settings, api_client, regular_user, monkeypatch) -> None:
    settings.TELEGRAM_WEBHOOK_SECRET = "secret"
    _link(regular_user, "CODE-1")

    def boom(*, code: str, chat_id: int, chat_type: str, chat_title: str) -> None:
        raise RuntimeError("db down")

    from kanban.views import telegram as telegram_views

    monkeypatch.setattr(telegram_views, "confirm_update", boom)
    # Django's test client re-raises unhandled exceptions by default; disable
    # that so we observe the 500 a production worker would return.
    api_client.raise_request_exception = False

    resp = api_client.post(
        WEBHOOK_URL, data=_update("CODE-1"), format="json", **{SECRET_HEADER: "secret"}
    )
    assert resp.status_code == 500
