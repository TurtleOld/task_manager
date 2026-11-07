from __future__ import annotations

from datetime import timedelta
from typing import Any

import pytest
from django.contrib.auth import get_user_model
from django.utils import timezone

from kanban.models import FamilyTelegramChat, TelegramAccount, TelegramLink
from kanban.telegram import (
    FAMILY_CHAT_CONFIRMED_TEXT,
    TelegramError,
    TelegramLinkError,
    _proxy_map,
    _session,
    bot_username,
    confirm_family_link,
    confirm_link,
    confirm_update,
    create_family_link,
    create_personal_link,
    parse_start_code,
    unlink_personal_chat,
)

User = get_user_model()


@pytest.mark.django_db()
def test_parse_start_code() -> None:
    assert parse_start_code("/start abc123") == "abc123"
    assert parse_start_code("/start@MyBot abc123") == "abc123"
    assert parse_start_code("/start") is None
    assert parse_start_code("hello") is None
    assert parse_start_code("/start  abc123 ") == "abc123"
    assert parse_start_code("/start@family_bot abc123") == "abc123"
    assert parse_start_code("/start@family_bot") is None
    assert parse_start_code("/startother abc123") is None


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
    assert session.trust_env is False
    assert session.proxies == {"http": "socks5h://proxy:1080", "https": "socks5h://proxy:1080"}

    settings.TELEGRAM_PROXY_URL = ""
    assert _session().proxies == {}


def test_session_ignores_environment_proxy(settings, monkeypatch) -> None:
    monkeypatch.setenv("HTTPS_PROXY", "http://env-proxy:9999")
    monkeypatch.setenv("ALL_PROXY", "http://env-all:8888")
    monkeypatch.delenv("REQUESTS_CA_BUNDLE", raising=False)
    monkeypatch.delenv("CURL_CA_BUNDLE", raising=False)

    settings.TELEGRAM_PROXY_URL = "http://explicit:8080"
    session = _session()
    assert session.trust_env is False
    assert session.proxies == {"http": "http://explicit:8080", "https": "http://explicit:8080"}

    # Empty TELEGRAM_PROXY_URL means direct, never the environment proxy.
    settings.TELEGRAM_PROXY_URL = ""
    assert _session().proxies == {}


def test_session_preserves_ca_bundle(settings, monkeypatch, tmp_path) -> None:
    ca = tmp_path / "ca.pem"
    ca.write_text("bogus")
    monkeypatch.setenv("REQUESTS_CA_BUNDLE", str(ca))
    settings.TELEGRAM_PROXY_URL = ""
    session = _session()
    assert session.verify == str(ca)


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
@pytest.mark.parametrize("chat_type", ["group", "supergroup", "channel"])
def test_confirm_update_personal_rejects_non_private_chat(regular_user, chat_type) -> None:
    link = TelegramLink.objects.create(
        code="personal-group",
        user=regular_user,
        purpose=TelegramLink.Purpose.PERSONAL,
        expires_at=timezone.now() + timedelta(minutes=5),
    )
    with pytest.raises(TelegramLinkError) as excinfo:
        confirm_update(code="personal-group", chat_id=123, chat_type=chat_type, chat_title="")
    assert excinfo.value.reason == "not_private_chat"
    assert not TelegramAccount.objects.filter(user=regular_user).exists()
    link.refresh_from_db()
    assert link.used_at is None


@pytest.mark.django_db()
def test_unlink_revokes_pending_links(regular_user) -> None:
    TelegramLink.objects.create(
        code="unlink-a",
        user=regular_user,
        expires_at=timezone.now() + timedelta(minutes=5),
    )
    b = TelegramLink.objects.create(
        code="unlink-b",
        user=regular_user,
        expires_at=timezone.now() + timedelta(minutes=5),
    )
    confirm_link(code="unlink-a", chat_id=111)
    assert TelegramAccount.objects.get(user=regular_user).chat_id == 111

    unlink_personal_chat(regular_user)

    assert not TelegramAccount.objects.filter(user=regular_user).exists()
    b.refresh_from_db()
    assert b.used_at is not None
    with pytest.raises(TelegramLinkError) as excinfo:
        confirm_link(code="unlink-b", chat_id=222)
    assert excinfo.value.reason == "already_used"
    assert not TelegramAccount.objects.filter(user=regular_user).exists()


@pytest.mark.django_db()
def test_unlink_does_not_touch_other_or_family_codes(regular_user) -> None:
    other = User.objects.create_user(username="other", password="pw")
    mine = TelegramLink.objects.create(
        code="mine", user=regular_user, expires_at=timezone.now() + timedelta(minutes=5)
    )
    family = TelegramLink.objects.create(
        code="family-keep",
        user=regular_user,
        purpose=TelegramLink.Purpose.FAMILY,
        expires_at=timezone.now() + timedelta(minutes=5),
    )
    theirs = TelegramLink.objects.create(
        code="theirs", user=other, expires_at=timezone.now() + timedelta(minutes=5)
    )

    unlink_personal_chat(regular_user)

    mine.refresh_from_db()
    assert mine.used_at is not None
    family.refresh_from_db()
    assert family.used_at is None
    theirs.refresh_from_db()
    assert theirs.used_at is None


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


# --- family chat linking ---


def _make_family_link(user: Any, *, code: str = "family-code", minutes: int = 5) -> TelegramLink:
    return TelegramLink.objects.create(
        code=code,
        user=user,
        purpose=TelegramLink.Purpose.FAMILY,
        expires_at=timezone.now() + timedelta(minutes=minutes),
    )


@pytest.fixture()
def recording_send(monkeypatch):
    """Patch the module-level send_message used by confirm_family_link."""
    sent: list[tuple[int, str]] = []

    def fake_send(*, chat_id: int, text: str) -> dict:
        sent.append((chat_id, text))
        return {"message_id": 1}

    from kanban import telegram

    monkeypatch.setattr(telegram, "send_message", fake_send)
    return sent


@pytest.mark.django_db()
def test_confirm_family_link_connects_chat(admin_user, recording_send) -> None:
    _make_family_link(admin_user, code="fam-1")

    confirm_family_link(code="fam-1", chat_id=-100200, chat_type="supergroup", chat_title="Семья")

    chat = FamilyTelegramChat.objects.get(pk=1)
    assert chat.chat_id == -100200
    assert chat.title == "Семья"
    assert recording_send == [(-100200, FAMILY_CHAT_CONFIRMED_TEXT)]


@pytest.mark.django_db()
def test_confirm_family_link_rejects_non_admin_completion(
    admin_user,
    regular_user,
    recording_send,
) -> None:
    link = _make_family_link(admin_user, code="revoked")
    admin_user.is_staff = False
    admin_user.save(update_fields=["is_staff"])

    with pytest.raises(TelegramLinkError) as excinfo:
        confirm_family_link(code="revoked", chat_id=-100200, chat_type="group", chat_title="")
    assert excinfo.value.reason == "not_admin"
    assert not FamilyTelegramChat.objects.exists()
    link.refresh_from_db()
    assert link.used_at is None
    assert recording_send == []


@pytest.mark.django_db()
def test_confirm_family_link_rejects_personal_code(admin_user, recording_send) -> None:
    TelegramLink.objects.create(
        code="personal-code",
        user=admin_user,
        purpose=TelegramLink.Purpose.PERSONAL,
        expires_at=timezone.now() + timedelta(minutes=5),
    )
    with pytest.raises(TelegramLinkError) as excinfo:
        confirm_family_link(code="personal-code", chat_id=-100200, chat_type="group", chat_title="")
    assert excinfo.value.reason == "wrong_purpose"
    assert not FamilyTelegramChat.objects.exists()
    assert recording_send == []


@pytest.mark.django_db()
def test_confirm_family_link_rejects_reused_and_expired(admin_user, recording_send) -> None:
    _make_family_link(admin_user, code="used")
    confirm_family_link(code="used", chat_id=-100200, chat_type="group", chat_title="")
    with pytest.raises(TelegramLinkError) as excinfo:
        confirm_family_link(code="used", chat_id=-100300, chat_type="group", chat_title="")
    assert excinfo.value.reason == "already_used"
    assert FamilyTelegramChat.objects.filter(pk=1, chat_id=-100200).exists()

    _make_family_link(admin_user, code="old", minutes=-1)
    with pytest.raises(TelegramLinkError) as excinfo:
        confirm_family_link(code="old", chat_id=-100200, chat_type="group", chat_title="")
    assert excinfo.value.reason == "expired"


@pytest.mark.django_db()
def test_confirm_family_link_rejects_private_chat(admin_user, recording_send) -> None:
    _make_family_link(admin_user, code="private")
    with pytest.raises(TelegramLinkError) as excinfo:
        confirm_family_link(code="private", chat_id=42, chat_type="private", chat_title="")
    assert excinfo.value.reason == "not_a_group"
    assert not FamilyTelegramChat.objects.exists()
    assert recording_send == []


@pytest.mark.django_db()
def test_confirm_family_link_rejects_unsendable_chat(monkeypatch, admin_user) -> None:
    _make_family_link(admin_user, code="mute")
    monkeypatch.setattr(
        "kanban.telegram.send_message",
        lambda **kwargs: (_ for _ in ()).throw(TelegramError("Telegram: bot is not a member")),
    )
    with pytest.raises(TelegramLinkError) as excinfo:
        confirm_family_link(code="mute", chat_id=-100200, chat_type="group", chat_title="")
    assert excinfo.value.reason == "send_failed"
    assert not FamilyTelegramChat.objects.exists()


@pytest.mark.django_db()
def test_confirm_family_link_truncates_long_title(admin_user, recording_send) -> None:
    _make_family_link(admin_user, code="long-title")

    confirm_family_link(code="long-title", chat_id=-100200, chat_type="group", chat_title="т" * 255)

    chat = FamilyTelegramChat.objects.get(pk=1)
    assert len(chat.title) == 200


@pytest.mark.django_db()
def test_confirm_family_link_reconnect_replaces_group(admin_user, recording_send) -> None:
    _make_family_link(admin_user, code="first")
    confirm_family_link(code="first", chat_id=-100200, chat_type="group", chat_title="Первая")
    _make_family_link(admin_user, code="second")
    confirm_family_link(code="second", chat_id=-100300, chat_type="supergroup", chat_title="Вторая")

    assert FamilyTelegramChat.objects.count() == 1
    chat = FamilyTelegramChat.objects.get(pk=1)
    assert chat.chat_id == -100300
    assert chat.title == "Вторая"


@pytest.mark.django_db()
def test_create_family_link_uses_startgroup(settings, admin_user) -> None:
    settings.TELEGRAM_BOT_TOKEN = "token"
    settings.TELEGRAM_BOT_USERNAME = "family_bot"

    data = create_family_link(admin_user)

    assert data["link"].startswith("https://t.me/family_bot?startgroup=")
    link = TelegramLink.objects.get(code=data["code"])
    assert link.purpose == TelegramLink.Purpose.FAMILY
    assert link.user_id == admin_user.id


@pytest.mark.django_db()
def test_confirm_update_routes_by_purpose(
    settings,
    admin_user,
    regular_user,
    recording_send,
) -> None:
    settings.TELEGRAM_BOT_TOKEN = "token"
    settings.TELEGRAM_BOT_USERNAME = "family_bot"
    personal = create_personal_link(regular_user)
    family = create_family_link(admin_user)

    confirm_update(code=personal["code"], chat_id=777, chat_type="private", chat_title="")
    assert TelegramAccount.objects.get(user=regular_user).chat_id == 777

    confirm_update(code=family["code"], chat_id=-100200, chat_type="group", chat_title="Семья")
    assert FamilyTelegramChat.objects.get(pk=1).chat_id == -100200


# --- family chat API ---


@pytest.mark.django_db()
def test_api_family_status(settings, auth_client, admin_user) -> None:
    settings.TELEGRAM_BOT_TOKEN = "token"
    settings.TELEGRAM_BOT_USERNAME = "family_bot"

    status = auth_client.get("/api/v1/notifications/telegram/family/").json()
    assert status == {"configured": True, "linked": False, "title": "", "confirmed_at": None}

    FamilyTelegramChat.objects.create(pk=1, chat_id=-100200, title="Семья")
    status = auth_client.get("/api/v1/notifications/telegram/family/").json()
    assert status["linked"] is True
    assert status["title"] == "Семья"
    assert status["confirmed_at"] is not None


@pytest.mark.django_db()
def test_api_family_link_requires_admin(settings, auth_client) -> None:
    settings.TELEGRAM_BOT_TOKEN = "token"
    settings.TELEGRAM_BOT_USERNAME = "family_bot"
    resp = auth_client.post("/api/v1/notifications/telegram/family/")
    assert resp.status_code == 403
    assert not TelegramLink.objects.filter(purpose=TelegramLink.Purpose.FAMILY).exists()


@pytest.mark.django_db()
def test_api_family_link_flow(settings, admin_client) -> None:
    settings.TELEGRAM_BOT_TOKEN = "token"
    settings.TELEGRAM_BOT_USERNAME = "family_bot"

    resp = admin_client.post("/api/v1/notifications/telegram/family/")
    assert resp.status_code == 201
    assert resp.json()["link"].startswith("https://t.me/family_bot?startgroup=")


@pytest.mark.django_db()
def test_api_family_unlink_requires_admin(settings, auth_client) -> None:
    FamilyTelegramChat.objects.create(pk=1, chat_id=-100200, title="")
    resp = auth_client.delete("/api/v1/notifications/telegram/family/")
    assert resp.status_code == 403
    assert FamilyTelegramChat.objects.exists()


@pytest.mark.django_db()
def test_api_family_unlink(settings, admin_client) -> None:
    FamilyTelegramChat.objects.create(pk=1, chat_id=-100200, title="")
    resp = admin_client.delete("/api/v1/notifications/telegram/family/")
    assert resp.status_code == 204
    assert not FamilyTelegramChat.objects.exists()


@pytest.mark.django_db()
def test_api_family_test_requires_admin(auth_client) -> None:
    resp = auth_client.post("/api/v1/notifications/telegram/family/test/")
    assert resp.status_code == 403


@pytest.mark.django_db()
def test_api_family_test_requires_link(admin_client) -> None:
    resp = admin_client.post("/api/v1/notifications/telegram/family/test/")
    assert resp.status_code == 409


@pytest.mark.django_db()
def test_api_family_test_sends(settings, admin_client, monkeypatch) -> None:
    FamilyTelegramChat.objects.create(pk=1, chat_id=-100200, title="")
    sent: list[tuple[int, str]] = []

    def fake_send(*, chat_id: int, text: str) -> dict:
        sent.append((chat_id, text))
        return {"message_id": 1}

    from kanban.views import telegram as telegram_views

    monkeypatch.setattr(telegram_views, "send_message", fake_send)

    resp = admin_client.post("/api/v1/notifications/telegram/family/test/")
    assert resp.status_code == 200
    assert resp.json()["delivered"] is True
    assert sent == [
        (-100200, "Проверка семейного чата Telegram. Если вы это видите — всё работает.")
    ]


@pytest.mark.django_db()
def test_api_family_test_failure(settings, admin_client, monkeypatch) -> None:
    FamilyTelegramChat.objects.create(pk=1, chat_id=-100200, title="")

    def failing_send(*, chat_id: int, text: str) -> dict:
        raise TelegramError("Telegram: chat not found")

    from kanban.views import telegram as telegram_views

    monkeypatch.setattr(telegram_views, "send_message", failing_send)

    resp = admin_client.post("/api/v1/notifications/telegram/family/test/")
    assert resp.status_code == 502
