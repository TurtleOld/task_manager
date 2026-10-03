from __future__ import annotations

import logging

from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer

from .consumers import board_group_name, session_group_name

logger = logging.getLogger(__name__)


def broadcast_board_event(board_id: int, event_type: str, data: dict) -> None:
    """Send a real-time event to all WebSocket clients subscribed to a board.

    This function is safe to call from synchronous Django views and the
    dispatcher.
    It is a no-op when the channel layer is not configured (e.g. in tests).
    """
    channel_layer = get_channel_layer()
    if channel_layer is None:
        return

    payload = {"type": event_type, **data}

    try:
        async_to_sync(channel_layer.group_send)(
            board_group_name(board_id),
            {
                "type": "board.event",
                "data": payload,
            },
        )
    except Exception:  # noqa: BLE001
        # Never let broadcast failures break the HTTP request/response cycle,
        # but do not hide them either: a dead channel layer otherwise looks
        # exactly like "nothing is happening".
        logger.exception("broadcast_board_event failed for board %s", board_id)


def disconnect_session_websockets(session_keys: list[str]) -> None:
    """Close every open WebSocket connection belonging to these sessions.

    A connection stays open after its session row is gone, so ending sessions
    must tell each one to close instead of relying on the next request.
    """
    channel_layer = get_channel_layer()
    if channel_layer is None:
        return

    for session_key in session_keys:
        try:
            async_to_sync(channel_layer.group_send)(
                session_group_name(session_key),
                {"type": "session.disconnect"},
            )
        except Exception:  # noqa: BLE001
            logger.exception("disconnect_session_websockets failed for session %s", session_key)
