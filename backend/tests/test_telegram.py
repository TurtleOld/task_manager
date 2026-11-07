from __future__ import annotations

from datetime import timedelta

import pytest
from django.utils import timezone

from kanban.models import TelegramAccount, TelegramLink
from kanban.telegram import (
    TelegramError,
    TelegramLinkError,
    _proxy_map,
    _session,
    bot_username,
    confirm_link,
    confirm_update,
    create_personal_link,
    parse_start_code,
)


@pytest.mark.django_db()
def test_parse_start_code() -> None:
    assert parse_start_code("/start abc123") == "abc123"
    assert parse_start_code("/start@MyBot abc123") == "abc123"
    assert parse_start_code("/start") is None
    assert parse_start_code("hello") is None
    assert parse_start_code("/start  abc123 ") == "abc123"


def test_proxy_map(settings) -> None:
    settings.TELEGRAM_PROXY_URL = ""
    assert _proxy_map() is None

    settings.TELEGRAM_PROXY_URL = "http://proxy:8080"
    assert _proxy_map() == {"http": "http://proxy:8080", "https": "http://proxy:8080"}

    settings.TELEGRAM_PROXY_URL = "socks5h://proxy:1080"
    assert _proxy_map() == {"http": "socks5h://proxy:1080", "https": "socks5h://proxy:1080"}


def test_session_applies_proxy(settings) -> None:
    settings.TELEGRAM_PROXY_URL = "socks5h://proxy:1080"
    session = _session()
    assert session.proxies == {"http": "socks5h://proxy:1080", "https": "socks5h://proxy:1080"}

    settings.TELEGRAM_PROXY_URL = ""
    assert _session().proxies == {}


def test_request_hides_token_when_connection_fails(settings, monkeypatch) -> None:
    import requests

    settings.TELEGRAM_BOT_TOKEN = "SECRET-TOKEN"
    settings.TELEGRAM_PROXY_URL = "http://user:pass@proxy:8080"

    class Boom(requests.exceptions.RequestException):
        pass

    def failing_post(self, url, **kwargs):
        raise Boom(f"Max retries exceeded with url: {url}")

    monkeypatch.setattr(requests.Session, "post", failing_post)

    from kanban import telegram

    with pytest.raises(TelegramError) as excinfo:
        telegram._request("getMe", {})
    message = str(excinfo.value)
    assert "SECRET-TOKEN" not in message
    assert "user:pass" not in message


@pytest.mark.django_db()
def test_confirm_link_binds_and_is_single_use(regular_user) -> None:
    link = TelegramLink.objects.create(
        code="code-1",
        user=regular_user,
        purpose=TelegramLink.Purpose.PERSONAL,
        expires_at=timezone.now() + timedelta(minutes=5),
    )

    confirm_link(code="code-1", chat_id=12345)

    account = TelegramAccount.objects.get(user=regular_user)
    assert account.chat_id == 12345
    link.refresh_from_db()
    assert link.used_at is not None

    with pytest.raises(TelegramLinkError) as excinfo:
        confirm_link(code="code-1", chat_id=99999)
    assert excinfo.value.reason == "already_used"
    assert TelegramAccount.objects.filter(user=regular_user).count() == 1
    account.refresh_from_db()
    assert account.chat_id == 12345


@pytest.mark.django_db()
def test_confirm_link_rejects_expired_and_unknown(regular_user) -> None:
    TelegramLink.objects.create(
        code="expired",
        user=regular_user,
        expires_at=timezone.now() - timedelta(seconds=1),
    )
    with pytest.raises(TelegramLinkError) as excinfo:
        confirm_link(code="expired", chat_id=1)
    assert excinfo.value.reason == "expired"
    assert not TelegramAccount.objects.filter(user=regular_user).exists()

    with pytest.raises(TelegramLinkError) as excinfo:
        confirm_link(code="nope", chat_id=1)
    assert excinfo.value.reason == "unknown_code"


@pytest.mark.django_db()
def test_confirm_link_rejects_family_purpose(regular_user) -> None:
    TelegramLink.objects.create(
        code="family-1",
        user=regular_user,
        purpose=TelegramLink.Purpose.FAMILY,
        expires_at=timezone.now() + timedelta(minutes=5),
    )
    with pytest.raises(TelegramLinkError) as excinfo:
        confirm_link(code="family-1", chat_id=1)
    assert excinfo.value.reason == "wrong_purpose"
    assert not TelegramAccount.objects.filter(user=regular_user).exists()


@pytest.mark.django_db()
def test_confirm_link_replaces_previous_chat(regular_user) -> None:
    TelegramAccount.objects.create(user=regular_user, chat_id=111)
    TelegramLink.objects.create(
        code="relink",
        user=regular_user,
        expires_at=timezone.now() + timedelta(minutes=5),
    )
    confirm_link(code="relink", chat_id=222)
    account = TelegramAccount.objects.get(user=regular_user)
    assert account.chat_id == 222


@pytest.mark.django_db()
def test_confirm_update_routes_personal_to_confirm_link(regular_user) -> None:
    TelegramLink.objects.create(
        code="personal-1",
        user=regular_user,
        purpose=TelegramLink.Purpose.PERSONAL,
        expires_at=timezone.now() + timedelta(minutes=5),
    )
    confirm_update(code="personal-1", chat_id=123, chat_type="private", chat_title="")
    assert TelegramAccount.objects.get(user=regular_user).chat_id == 123


@pytest.mark.django_db()
def test_confirm_update_family_not_implemented(regular_user) -> None:
    TelegramLink.objects.create(
        code="family-1",
        user=regular_user,
        purpose=TelegramLink.Purpose.FAMILY,
        expires_at=timezone.now() + timedelta(minutes=5),
    )
    with pytest.raises(TelegramLinkError) as excinfo:
        confirm_update(code="family-1", chat_id=123, chat_type="group", chat_title="Family")
    assert excinfo.value.reason == "family_not_implemented"


@pytest.mark.django_db()
def test_create_link_requires_configured_bot(settings, regular_user) -> None:
    settings.TELEGRAM_BOT_TOKEN = ""
    settings.TELEGRAM_BOT_USERNAME = ""
    with pytest.raises(TelegramError):
        create_personal_link(regular_user)


@pytest.mark.django_db()
def test_create_link_uses_env_username(settings, regular_user) -> None:
    settings.TELEGRAM_BOT_TOKEN = "token"
    settings.TELEGRAM_BOT_USERNAME = "family_bot"

    data = create_personal_link(regular_user)

    assert data["link"] == f"https://t.me/family_bot?start={data['code']}"
    link = TelegramLink.objects.get(code=data["code"])
    assert link.user_id == regular_user.id
    assert link.purpose == TelegramLink.Purpose.PERSONAL


@pytest.mark.django_db()
def test_bot_username_falls_back_to_getme(settings, monkeypatch, regular_user) -> None:
    settings.TELEGRAM_BOT_TOKEN = "token"
    settings.TELEGRAM_BOT_USERNAME = ""

    from kanban import telegram

    monkeypatch.setattr(telegram, "get_me", lambda: {"username": "resolved_bot"})
    assert bot_username() == "resolved_bot"


@pytest.mark.django_db()
def test_bot_username_none_when_not_configured(settings) -> None:
    settings.TELEGRAM_BOT_TOKEN = ""
    settings.TELEGRAM_BOT_USERNAME = ""
    assert bot_username() is None


# --- API views ---


@pytest.mark.django_db()
def test_api_link_unavailable_when_not_configured(settings, auth_client) -> None:
    settings.TELEGRAM_BOT_TOKEN = ""
    settings.TELEGRAM_BOT_USERNAME = ""
    resp = auth_client.post("/api/v1/notifications/telegram/")
    assert resp.status_code == 503


@pytest.mark.django_db()
def test_api_link_and_status_flow(settings, auth_client) -> None:
    settings.TELEGRAM_BOT_TOKEN = "token"
    settings.TELEGRAM_BOT_USERNAME = "family_bot"

    status = auth_client.get("/api/v1/notifications/telegram/").json()
    assert status["configured"] is True
    assert status["linked"] is False

    resp = auth_client.post("/api/v1/notifications/telegram/")
    assert resp.status_code == 201
    link = resp.json()
    assert link["link"].startswith("https://t.me/family_bot?start=")

    code = link["code"]
    confirm_link(code=code, chat_id=777)

    status = auth_client.get("/api/v1/notifications/telegram/").json()
    assert status["linked"] is True
    assert status["confirmed_at"] is not None


@pytest.mark.django_db()
def test_api_unlink(settings, auth_client, regular_user) -> None:
    TelegramAccount.objects.create(user=regular_user, chat_id=555)
    resp = auth_client.delete("/api/v1/notifications/telegram/")
    assert resp.status_code == 204
    assert not TelegramAccount.objects.filter(user=regular_user).exists()


@pytest.mark.django_db()
def test_api_test_message_requires_link(auth_client) -> None:
    resp = auth_client.post("/api/v1/notifications/telegram/test/")
    assert resp.status_code == 409


@pytest.mark.django_db()
def test_api_test_message_sends(settings, auth_client, regular_user, monkeypatch) -> None:
    TelegramAccount.objects.create(user=regular_user, chat_id=555)
    sent: list[tuple[int, str]] = []

    def fake_send(*, chat_id: int, text: str) -> dict:
        sent.append((chat_id, text))
        return {"message_id": 1}

    from kanban.views import telegram as telegram_views

    monkeypatch.setattr(telegram_views, "send_message", fake_send)

    resp = auth_client.post("/api/v1/notifications/telegram/test/")
    assert resp.status_code == 200
    assert resp.json()["delivered"] is True
    assert sent == [(555, "Проверка подключения Telegram. Если вы это видите — всё работает.")]


@pytest.mark.django_db()
def test_api_test_message_failure(settings, auth_client, regular_user, monkeypatch) -> None:
    TelegramAccount.objects.create(user=regular_user, chat_id=555)

    def failing_send(*, chat_id: int, text: str) -> dict:
        raise TelegramError("Telegram: chat not found")

    from kanban.views import telegram as telegram_views

    monkeypatch.setattr(telegram_views, "send_message", failing_send)

    resp = auth_client.post("/api/v1/notifications/telegram/test/")
    assert resp.status_code == 502
