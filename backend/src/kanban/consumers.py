from __future__ import annotations

from channels.generic.websocket import AsyncJsonWebsocketConsumer
from rest_framework.authtoken.models import Token


def board_group_name(board_id: int | str) -> str:
    return f"board_{board_id}"


def user_group_name(user_id: int | str) -> str:
    return f"user_{user_id}"


class BoardConsumer(AsyncJsonWebsocketConsumer):
    """WebSocket consumer for a single board.

    URL pattern: ws/boards/<board_id>/
    Authentication: Token passed as query param `token=<key>` or
                    Authorization header (header auth is not available in WS
                    from browsers, so query param is the primary method).
    """

    async def connect(self) -> None:
        self.board_id = self.scope["url_route"]["kwargs"]["board_id"]
        self.group_name = board_group_name(self.board_id)

        # Authenticate via token query param
        user = await self._get_user()
        if user is None:
            await self.close(code=4001)
            return

        self.user = user
        self.user_group_name = user_group_name(user.id)
        await self.channel_layer.group_add(self.group_name, self.channel_name)
        await self.channel_layer.group_add(self.user_group_name, self.channel_name)
        await self.accept()

    async def disconnect(self, close_code: int) -> None:
        if hasattr(self, "group_name"):
            await self.channel_layer.group_discard(self.group_name, self.channel_name)
        if hasattr(self, "user_group_name"):
            await self.channel_layer.group_discard(self.user_group_name, self.channel_name)

    # Receive a message from the group and forward it to the client
    async def board_event(self, event: dict) -> None:
        await self.send_json(event["data"])

    # Sent to this user's group when their account is deactivated.
    async def user_disconnect(self, event: dict) -> None:
        await self.close(code=4001)

    async def _get_user(self):
        from channels.db import database_sync_to_async

        query_string = self.scope.get("query_string", b"").decode()
        token_key = None
        for part in query_string.split("&"):
            if part.startswith("token="):
                token_key = part[len("token=") :]
                break

        if not token_key:
            return None

        @database_sync_to_async
        def fetch_user(key: str):
            try:
                token = Token.objects.select_related("user").get(key=key)
            except Token.DoesNotExist:
                return None
            return token.user if token.user.is_active else None

        return await fetch_user(token_key)
