from __future__ import annotations

from rest_framework import permissions, status
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from ..models import TelegramAccount
from ..telegram import (
    TelegramError,
    TelegramNotConfiguredError,
    create_personal_link,
    send_message,
    telegram_configured,
)


class TelegramLinkView(APIView):
    """Link or unlink the current user's personal Telegram chat.

    The chat_id is never provided by the client: it arrives from the bot's own
    `getUpdates` stream when the user presses Start on the one-time deep link.
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
        TelegramAccount.objects.filter(user=request.user).delete()
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
