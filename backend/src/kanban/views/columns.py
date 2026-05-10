from __future__ import annotations

from rest_framework import serializers, viewsets

from ..broadcast import broadcast_board_event
from ..models import Column, NotificationEventType
from ..notifications import create_notification_event
from ..serializers import ColumnSerializer


class ColumnViewSet(viewsets.ModelViewSet[Column]):
    queryset = Column.objects.select_related("board").all().order_by("position", "id")
    serializer_class = ColumnSerializer
    filterset_fields = ["board"]

    def perform_create(self, serializer: ColumnSerializer) -> None:
        column = serializer.save()
        actor = self.request.user if self.request.user.is_authenticated else None
        create_notification_event(
            event_type=NotificationEventType.COLUMN_CREATED.value,
            actor=actor,
            board=column.board,
            column=column,
            summary=f"Создана колонка «{column.name}»",
            payload={"board": column.board.name, "column": column.name},
        )
        broadcast_board_event(column.board_id, "column.created", {"column": ColumnSerializer(column).data})

    def perform_update(self, serializer: ColumnSerializer) -> None:
        column = serializer.save()
        actor = self.request.user if self.request.user.is_authenticated else None
        create_notification_event(
            event_type=NotificationEventType.COLUMN_UPDATED.value,
            actor=actor,
            board=column.board,
            column=column,
            summary=f"Обновлена колонка «{column.name}»",
            payload={"board": column.board.name, "column": column.name},
        )
        broadcast_board_event(column.board_id, "column.updated", {"column": ColumnSerializer(column).data})

    def perform_destroy(self, instance: Column) -> None:
        if instance.is_default:
            raise serializers.ValidationError({"detail": "Нельзя удалить стандартную колонку"})
        actor = self.request.user if self.request.user.is_authenticated else None
        summary = f"Удалена колонка «{instance.name}»"
        payload = {"board": instance.board.name, "column": instance.name}
        board_id = instance.board_id
        column_id = instance.id
        board = instance.board
        instance.delete()
        create_notification_event(
            event_type=NotificationEventType.COLUMN_DELETED.value,
            actor=actor,
            board=board,
            summary=summary,
            payload=payload,
        )
        broadcast_board_event(board_id, "column.deleted", {"column_id": column_id})
