from __future__ import annotations

from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer

from .consumers import board_group_name


def broadcast_board_event(board_id: int, event_type: str, data: dict) -> None:
    """Send a real-time event to all WebSocket clients subscribed to a board.

    This function is safe to call from synchronous Django views/Celery tasks.
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
        # Never let broadcast failures break the HTTP request/response cycle.
        pass
