"""Telegram Bot API client and personal/family chat linking.

The family shares one bot, configured on the server via .env. Every call to
api.telegram.org goes through the configured external proxy when one is set —
there is deliberately no direct fallback, because a reachable proxy is the
whole point of the setting. The proxy accepts HTTP(S) and SOCKS5; a `socks5h://`
URL additionally resolves Telegram's hostname through the proxy.

The bot token lives in the request URL, so the raw HTTP exception is never
logged or returned: it can embed the URL with the token, and a proxy error can
embed proxy credentials. Errors surface to callers as a generic TelegramError.
"""

from __future__ import annotations

import logging
import os
import secrets
from datetime import timedelta
from typing import Any

from django.conf import settings
from django.db import transaction
from django.utils import timezone

from .models import FamilyTelegramChat, TelegramAccount, TelegramLink

logger = logging.getLogger(__name__)

TELEGRAM_API = "https://api.telegram.org"

GROUP_CHAT_TYPES = frozenset({"group", "supergroup"})
FAMILY_CHAT_CONFIRMED_TEXT = (
    "Семейный чат подключён к приложению. Отключить можно в настройках."
)


class TelegramError(RuntimeError):
    """Telegram is unreachable or rejected the request."""


class TelegramNotConfiguredError(TelegramError):
    """TELEGRAM_BOT_TOKEN is missing, so no Telegram request can be made."""


class TelegramLinkError(RuntimeError):
    """A deep-link code cannot be confirmed. `reason` is a stable slug for logs."""

    def __init__(self, reason: str) -> None:
        super().__init__(reason)
        self.reason = reason


def telegram_configured() -> bool:
    return bool(settings.TELEGRAM_BOT_TOKEN)


def _proxy_map() -> dict[str, str] | None:
    url = settings.TELEGRAM_PROXY_URL
    if not url:
        return None
    # `requests` keys proxies by scheme; both the http and https forms of the
    # Telegram endpoint go through the same proxy. http(s), socks5 and socks5h
    # schemes are all passed through untouched.
    return {"http": url, "https": url}


def _session() -> Any:
    import requests

    session = requests.Session()
    # TELEGRAM_PROXY_URL is the only proxy source: never inherit HTTP(S)_PROXY or
    # ALL_PROXY from the environment, so an empty value really means direct.
    session.trust_env = False
    # Keep a custom CA bundle if the operator set one; trust_env=False would
    # otherwise drop it while still keeping certifi's default verification.
    ca_bundle = os.environ.get("REQUESTS_CA_BUNDLE") or os.environ.get("CURL_CA_BUNDLE")
    if ca_bundle:
        session.verify = ca_bundle
    proxies = _proxy_map()
    if proxies:
        session.proxies.update(proxies)
    return session


def _request(method: str, payload: dict[str, Any], *, timeout: int = 30) -> Any:
    """POST to the Bot API and return the decoded `result`. Raises TelegramError."""
    if not telegram_configured():
        raise TelegramNotConfiguredError("TELEGRAM_BOT_TOKEN is not configured")

    import requests

    url = f"{TELEGRAM_API}/bot{settings.TELEGRAM_BOT_TOKEN}/{method}"
    try:
        response = _session().post(url, json=payload, timeout=timeout)
    except requests.exceptions.RequestException as exc:
        # The exception may embed the request URL (with the token) or the proxy
        # URL (with credentials), so only its class is safe to record.
        logger.warning("telegram_connection_error type=%s", type(exc).__name__)
        raise TelegramError("Telegram недоступен") from exc

    try:
        data = response.json()
    except ValueError as exc:
        logger.warning("telegram_non_json_response status=%s", response.status_code)
        raise TelegramError("Telegram вернул некорректный ответ") from exc

    if not data.get("ok"):
        description = str(data.get("description", "unknown error"))
        logger.warning("telegram_api_error description=%s", description)
        raise TelegramError(f"Telegram: {description}")
    return data.get("result", {})


def get_me() -> dict[str, Any]:
    return _request("getMe", {})


def send_message(*, chat_id: int, text: str) -> dict[str, Any]:
    return _request("sendMessage", {"chat_id": chat_id, "text": text})


def set_webhook(*, url: str, secret_token: str) -> dict[str, Any]:
    """Register the public webhook. `secret_token` travels in the request body,
    never in the URL, so it stays out of logs."""
    return _request("setWebhook", {"url": url, "secret_token": secret_token})


def get_webhook_info() -> dict[str, Any]:
    return _request("getWebhookInfo", {})


def bot_username() -> str | None:
    """The bot's public username, from env or resolved via getMe."""
    configured = settings.TELEGRAM_BOT_USERNAME.strip().lstrip("@")
    if configured:
        return configured
    if not telegram_configured():
        return None
    try:
        return str(get_me().get("username") or "") or None
    except TelegramError:
        return None


def parse_start_code(text: str) -> str | None:
    """Extract the deep-link payload from `/start <code>` or `/start@<bot> <code>`."""
    parts = text.strip().split(maxsplit=1)
    if not parts:
        return None
    command = parts[0].split("@", 1)[0]
    if command != "/start":
        return None
    if len(parts) == 1:
        return None
    code = parts[1].strip()
    return code or None


def create_personal_link(user: Any) -> dict[str, Any]:
    """Create a one-time personal deep link for `user`.

    Raises TelegramError when the bot is not configured or its username cannot
    be resolved.
    """
    return _create_link(user, purpose=TelegramLink.Purpose.PERSONAL, param="start")


def create_family_link(user: Any) -> dict[str, Any]:
    """Create a one-time `startgroup` deep link for a family admin.

    Raises TelegramError when the bot is not configured or its username cannot
    be resolved.
    """
    return _create_link(user, purpose=TelegramLink.Purpose.FAMILY, param="startgroup")


def _create_link(user: Any, *, purpose: Any, param: str) -> dict[str, Any]:
    username = bot_username()
    if not username:
        raise TelegramError("Не удалось определить имя бота")
    code = secrets.token_urlsafe(24)
    expires_at = timezone.now() + timedelta(seconds=settings.TELEGRAM_LINK_TTL_SECONDS)
    TelegramLink.objects.create(
        code=code,
        user=user,
        purpose=purpose,
        expires_at=expires_at,
    )
    return {
        "link": f"https://t.me/{username}?{param}={code}",
        "code": code,
        "expires_at": expires_at,
    }


def confirm_link(*, code: str, chat_id: int) -> None:
    """Bind `chat_id` to the user who created the one-time `code`.

    Validates that the code exists, is unexpired, unused and personal. A
    repeated or wrong-purpose update raises TelegramLinkError and changes
    nothing. Raises TelegramLinkError for every rejected confirmation.
    """
    with transaction.atomic():
        link = TelegramLink.objects.select_for_update().filter(code=code).first()
        if link is None:
            raise TelegramLinkError("unknown_code")
        if link.used_at is not None:
            raise TelegramLinkError("already_used")
        if timezone.now() > link.expires_at:
            raise TelegramLinkError("expired")
        if link.purpose != TelegramLink.Purpose.PERSONAL:
            raise TelegramLinkError("wrong_purpose")

        link.used_at = timezone.now()
        link.save(update_fields=["used_at"])
        TelegramAccount.objects.update_or_create(
            user_id=link.user_id,
            defaults={"chat_id": chat_id},
        )
        logger.info("telegram_link_confirmed user=%s purpose=%s", link.user_id, link.purpose)


def confirm_update(
    *,
    code: str,
    chat_id: int,
    chat_type: str,
    chat_title: str,
) -> None:
    """Confirm a `/start` update, routing by the link's `purpose`.

    Personal codes bind the user's own chat (ticket 02); family codes bind the
    family chat (ticket 04) via `confirm_family_link`. The `purpose` stored on
    the code decides, so a personal code can never become a family chat and
    vice versa.
    """
    link = TelegramLink.objects.filter(code=code).first()
    if link is None:
        raise TelegramLinkError("unknown_code")
    if link.purpose == TelegramLink.Purpose.FAMILY:
        confirm_family_link(
            code=code,
            chat_id=chat_id,
            chat_type=chat_type,
            chat_title=chat_title,
        )
        return
    if chat_type != "private":
        raise TelegramLinkError("not_private_chat")
    confirm_link(code=code, chat_id=chat_id)


def confirm_family_link(*, code: str, chat_id: int, chat_type: str, chat_title: str) -> None:
    """Connect the family chat from an admin's one-time `startgroup` code.

    Admin rights are re-checked here, at completion: a code issued while the
    user was an admin must not connect the chat after the role was taken away.
    The chat must be a group, and the bot must be able to post there — the
    probe message doubles as the visible confirmation in the chat. On success
    the single FamilyTelegramChat row is replaced, so two groups are never
    connected at once.
    """
    with transaction.atomic():
        link = TelegramLink.objects.select_for_update().filter(code=code).first()
        if link is None:
            raise TelegramLinkError("unknown_code")
        if link.used_at is not None:
            raise TelegramLinkError("already_used")
        if timezone.now() > link.expires_at:
            raise TelegramLinkError("expired")
        if link.purpose != TelegramLink.Purpose.FAMILY:
            raise TelegramLinkError("wrong_purpose")
        if not link.user.is_staff:
            raise TelegramLinkError("not_admin")
        if chat_type not in GROUP_CHAT_TYPES:
            raise TelegramLinkError("not_a_group")
        link.used_at = timezone.now()
        link.save(update_fields=["used_at"])

    try:
        send_message(chat_id=chat_id, text=FAMILY_CHAT_CONFIRMED_TEXT)
    except TelegramError as exc:
        raise TelegramLinkError("send_failed") from exc
    FamilyTelegramChat.objects.update_or_create(
        pk=1,
        defaults={
            "chat_id": chat_id,
            # Telegram allows group titles longer than the model column.
            "title": chat_title[:200],
            "confirmed_at": timezone.now(),
        },
    )
    logger.info("family_chat_confirmed chat_id=%s by_user=%s", chat_id, link.user_id)


def unlink_personal_chat(user: Any) -> None:
    """Drop a user's personal Telegram chat and void their pending link codes.

    Pending personal codes are marked used under the same row lock `confirm_link`
    takes, so an in-flight confirmation and this unlink serialize: whichever
    commits second observes the other's result and cannot restore the binding.
    Other users' codes and family codes are left untouched.
    """
    now = timezone.now()
    with transaction.atomic():
        pending = TelegramLink.objects.select_for_update().filter(
            user=user,
            purpose=TelegramLink.Purpose.PERSONAL,
            used_at__isnull=True,
        )
        for link in pending:
            link.used_at = now
            link.save(update_fields=["used_at"])
        TelegramAccount.objects.filter(user=user).delete()
