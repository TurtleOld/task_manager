from __future__ import annotations

from channels.generic.websocket import AsyncJsonWebsocketConsumer
from django.conf import settings
from django.utils.crypto import constant_time_compare

PROTOCOL = "tm.v1"
SESSION_CLOSED_CODE = 4001


def board_group_name(board_id: int | str) -> str:
    return f"board_{board_id}"


def user_group_name(user_id: int | str) -> str:
    return f"user_{user_id}"


class BoardConsumer(AsyncJsonWebsocketConsumer):
    """Live events of one board, for the session in the cookie.

    A browser attaches cookies to cross-site WebSocket handshakes too, so the
    client must also prove it can read the CSRF cookie: it offers the
    subprotocols ``[PROTOCOL, <csrftoken>]`` (double submit).
    """

    async def connect(self) -> None:
        user = self.scope.get("user")
        if user is None or not user.is_authenticated or not self._csrf_matches():
            await self._close_session()
            return

        self.board_id = self.scope["url_route"]["kwargs"]["board_id"]
        self.group_name = board_group_name(self.board_id)
        self.user_group_name = user_group_name(user.id)
        await self.channel_layer.group_add(self.group_name, self.channel_name)
        await self.channel_layer.group_add(self.user_group_name, self.channel_name)
        await self.accept(subprotocol=PROTOCOL)

    async def disconnect(self, close_code: int) -> None:
        if hasattr(self, "group_name"):
            await self.channel_layer.group_discard(self.group_name, self.channel_name)
        if hasattr(self, "user_group_name"):
            await self.channel_layer.group_discard(self.user_group_name, self.channel_name)

    async def board_event(self, event: dict) -> None:
        await self.send_json(event["data"])

    # Sent to this user's group when their account is deactivated.
    async def user_disconnect(self, event: dict) -> None:
        await self.close(code=SESSION_CLOSED_CODE)

    def _csrf_matches(self) -> bool:
        offered = self.scope.get("subprotocols") or []
        cookie = self.scope.get("cookies", {}).get(settings.CSRF_COOKIE_NAME, "")
        if len(offered) != 2 or offered[0] != PROTOCOL or not cookie:
            return False
        return constant_time_compare(offered[1], cookie)

    async def _close_session(self) -> None:
        # Closing before accept() turns into an HTTP 403 that browsers report
        # as 1006, and the client would keep reconnecting. Accept first so the
        # client sees 4001 and signs out instead.
        offered = self.scope.get("subprotocols") or []
        await self.accept(subprotocol=PROTOCOL if PROTOCOL in offered else None)
        await self.close(code=SESSION_CLOSED_CODE)
