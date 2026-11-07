from __future__ import annotations

import hmac
from typing import Any

from django.conf import settings
from rest_framework import permissions, status
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from ..models import FamilyTelegramChat, TelegramAccount
from ..telegram import (
    TelegramError,
    TelegramLinkError,
    TelegramNotConfiguredError,
    confirm_update,
    create_family_link,
    create_personal_link,
    parse_start_code,
    send_message,
    telegram_configured,
    unlink_family_chat,
    unlink_personal_chat,
)
from .users import IsAdminUser


class TelegramLinkView(APIView):
    """Link or unlink the current user's personal Telegram chat.

    The chat_id is never provided by the client: it arrives from the bot's own
    webhook when the user presses Start on the one-time deep link.
    """

    permission_classes = [permissions.IsAuthenticated]

    def get(self, request: Request) -> Response:
        account = TelegramAccount.objects.filter(user=request.user).first()
        return Response(
            {
                "configured": telegram_configured(),
                "linked": account is not None,
                "confirmed_at": account.confirmed_at if account else None,
            }
        )

    def post(self, request: Request) -> Response:
        try:
            data = create_personal_link(request.user)
        except TelegramError as exc:
            return Response(
                {"detail": str(exc)},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )
        return Response(data, status=status.HTTP_201_CREATED)

    def delete(self, request: Request) -> Response:
        unlink_personal_chat(request.user)
        return Response(status=status.HTTP_204_NO_CONTENT)


class TelegramTestMessageView(APIView):
    """Send a test message to the current user's linked personal chat."""

    permission_classes = [permissions.IsAuthenticated]

    def post(self, request: Request) -> Response:
        account = TelegramAccount.objects.filter(user=request.user).first()
        if account is None:
            return Response(
                {"detail": "Telegram не подключён"},
                status=status.HTTP_409_CONFLICT,
            )
        try:
            send_message(
                chat_id=account.chat_id,
                text="Проверка подключения Telegram. Если вы это видите — всё работает.",
            )
        except TelegramNotConfiguredError:
            return Response(
                {"detail": "Telegram не настроен на сервере"},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )
        except TelegramError as exc:
            return Response(
                {"detail": str(exc)},
                status=status.HTTP_502_BAD_GATEWAY,
            )
        return Response({"delivered": True, "detail": "Отправлено"}, status=status.HTTP_200_OK)


class TelegramWebhookView(APIView):
    """Receive Telegram bot updates.

    Public: Telegram posts here, so there is no session auth, CSRF or throttling.
    The only credential is the `X-Telegram-Bot-Api-Secret-Token` header that the
    install owner configured in `setWebhook`; retries must not be rate-limited
    into loss. Rejects a bad or missing secret before touching the body.
    """

    authentication_classes: list = []
    permission_classes = [permissions.AllowAny]
    throttle_classes: list = []

    def post(self, request: Request) -> Response:
        if not _webhook_secret_matches(request):
            return Response(status=status.HTTP_403_FORBIDDEN)

        if not _webhook_body_within_limit(request):
            return Response(status=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE)

        update: Any = request.data
        if not isinstance(update, dict) or not isinstance(update.get("update_id"), int):
            return Response(status=status.HTTP_400_BAD_REQUEST)

        message: Any = update.get("message")
        if not isinstance(message, dict):
            return Response(status=status.HTTP_200_OK)

        chat: Any = message.get("chat")
        if not isinstance(chat, dict):
            chat = {}
        code = parse_start_code(str(message.get("text") or ""))
        if not code or not isinstance(chat.get("id"), int):
            return Response(status=status.HTTP_200_OK)

        try:
            confirm_update(
                code=code,
                chat_id=int(chat["id"]),
                chat_type=str(chat.get("type") or ""),
                chat_title=str(chat.get("title") or ""),
            )
        except TelegramLinkError:
            # Ack a permanent rejection (unknown/used/expired/wrong purpose) so
            # Telegram stops re-delivering it.
            return Response(status=status.HTTP_200_OK)
        # No catch-all: a database error must stay a 500 so Telegram retries.
        return Response(status=status.HTTP_200_OK)


# A /start update is under 1 KB; bound the body so a hostile payload is rejected
# before JSON parsing without reading it into memory.
WEBHOOK_MAX_BODY_BYTES = 64 * 1024


def _webhook_body_within_limit(request: Request) -> bool:
    length = request.headers.get("Content-Length")
    if length is None:
        return True
    try:
        return int(length) <= WEBHOOK_MAX_BODY_BYTES
    except ValueError:
        return False


def _webhook_secret_matches(request: Request) -> bool:
    expected = settings.TELEGRAM_WEBHOOK_SECRET
    if not expected:
        return False
    provided = request.headers.get("X-Telegram-Bot-Api-Secret-Token", "")
    # compare_digest rejects non-ASCII str; compare bytes to fail closed on any
    # header value instead of raising.
    return hmac.compare_digest(provided.encode("utf-8"), expected.encode("utf-8"))


class FamilyChatView(APIView):
    """Manage the family's shared Telegram chat.

    The status is readable by every family member — ticket 05 offers the
    connected chat as a delivery destination — but creating a link or
    disconnecting is admin-only, and `confirm_family_link` re-checks admin
    rights when the binding completes.
    """

    permission_classes = [permissions.IsAuthenticated]

    def get(self, request: Request) -> Response:
        chat = FamilyTelegramChat.objects.filter(pk=1).first()
        return Response(
            {
                "configured": telegram_configured(),
                "linked": chat is not None,
                "title": chat.title if chat else "",
                "confirmed_at": chat.confirmed_at if chat else None,
            }
        )

    def post(self, request: Request) -> Response:
        if not request.user.is_staff:
            return Response(
                {"detail": "Только администратор семьи может подключать общий чат"},
                status=status.HTTP_403_FORBIDDEN,
            )
        try:
            data = create_family_link(request.user)
        except TelegramError as exc:
            return Response(
                {"detail": str(exc)},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )
        return Response(data, status=status.HTTP_201_CREATED)

    def delete(self, request: Request) -> Response:
        if not request.user.is_staff:
            return Response(
                {"detail": "Только администратор семьи может отключать общий чат"},
                status=status.HTTP_403_FORBIDDEN,
            )
        unlink_family_chat()
        return Response(status=status.HTTP_204_NO_CONTENT)


class FamilyChatTestMessageView(APIView):
    """Send a test message to the connected family chat (admins only)."""

    permission_classes = [IsAdminUser]

    def post(self, request: Request) -> Response:
        chat = FamilyTelegramChat.objects.filter(pk=1).first()
        if chat is None:
            return Response(
                {"detail": "Семейный чат не подключён"},
                status=status.HTTP_409_CONFLICT,
            )
        try:
            send_message(
                chat_id=chat.chat_id,
                text="Проверка семейного чата Telegram. Если вы это видите — всё работает.",
            )
        except TelegramNotConfiguredError:
            return Response(
                {"detail": "Telegram не настроен на сервере"},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )
        except TelegramError as exc:
            return Response(
                {"detail": str(exc)},
                status=status.HTTP_502_BAD_GATEWAY,
            )
        return Response({"delivered": True, "detail": "Отправлено"}, status=status.HTTP_200_OK)
