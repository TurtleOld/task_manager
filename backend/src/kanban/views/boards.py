from __future__ import annotations

from decimal import Decimal
from typing import Any

from rest_framework import viewsets

from ..broadcast import broadcast_board_event
from ..models import Board, Column, NotificationEventType
from ..notifications import create_notification_event
from ..serializers import BoardSerializer, ColumnSerializer


class BoardViewSet(viewsets.ModelViewSet[Board]):
    queryset = Board.objects.all().order_by("id")
    serializer_class = BoardSerializer

    def perform_create(self, serializer: BoardSerializer) -> None:
        board = serializer.save()

        default_columns = [
            {"name": "To Do", "icon": "📋", "position": Decimal("1"), "is_default": True},
            {"name": "In Progress", "icon": "⚡", "position": Decimal("2"), "is_default": True},
            {"name": "Done", "icon": "✅", "position": Decimal("3"), "is_default": True, "is_done": True},
        ]
        for col_data in default_columns:
            Column.objects.create(board=board, **col_data)

        actor = self.request.user if self.request.user.is_authenticated else None
        create_notification_event(
            event_type=NotificationEventType.BOARD_CREATED.value,
            actor=actor,
            board=board,
            summary=f"Создана доска «{board.name}»",
            payload={"board": board.name},
        )
        broadcast_board_event(board.id, "board.created", {"board": BoardSerializer(board).data})

    def perform_update(self, serializer: BoardSerializer) -> None:
        board = serializer.save()
        actor = self.request.user if self.request.user.is_authenticated else None
        create_notification_event(
            event_type=NotificationEventType.BOARD_UPDATED.value,
            actor=actor,
            board=board,
            summary=f"Обновлена доска «{board.name}»",
            payload={"board": board.name},
        )
        broadcast_board_event(board.id, "board.updated", {"board": BoardSerializer(board).data})

    def perform_destroy(self, instance: Board) -> None:
        actor = self.request.user if self.request.user.is_authenticated else None
        summary = f"Удалена доска «{instance.name}»"
        payload = {"board": instance.name}
        board_id = instance.id
        board = instance
        instance.delete()
        create_notification_event(
            event_type=NotificationEventType.BOARD_DELETED.value,
            actor=actor,
            board=board,
            summary=summary,
            payload=payload,
        )
        broadcast_board_event(board_id, "board.deleted", {"board_id": board_id})
