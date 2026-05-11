from __future__ import annotations

from rest_framework import viewsets

from ..broadcast import broadcast_board_event
from ..inbox import create_default_board_columns
from ..models import Board, NotificationEventType
from ..notifications import create_notification_event
from ..serializers import BoardSerializer


class BoardViewSet(viewsets.ModelViewSet[Board]):
    queryset = Board.objects.all().order_by("id")
    serializer_class = BoardSerializer

    def get_queryset(self):
        return Board.objects.filter(is_inbox=False).order_by("id")

    def perform_create(self, serializer: BoardSerializer) -> None:
        board = serializer.save()
        create_default_board_columns(board)

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
