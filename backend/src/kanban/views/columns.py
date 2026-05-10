from __future__ import annotations

from decimal import Decimal
from typing import Any

from django.db import transaction
from rest_framework import serializers, viewsets
from rest_framework.decorators import action
from rest_framework.request import Request
from rest_framework.response import Response

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
        broadcast_board_event(
            column.board_id,
            "column.created",
            {"column": ColumnSerializer(column).data},
        )

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
        broadcast_board_event(
            column.board_id,
            "column.updated",
            {"column": ColumnSerializer(column).data},
        )

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

    @action(detail=True, methods=["post"], url_path="move")
    def move(self, request: Request, pk: str | None = None) -> Response:
        column = self.get_object()
        payload: dict[str, Any] = request.data or {}
        before_id = payload.get("before_id")
        after_id = payload.get("after_id")

        with transaction.atomic():
            neighbor_ids = [int(cid) for cid in [before_id, after_id] if cid is not None]
            positions: dict[int, Decimal] = {}
            if neighbor_ids:
                neighbors = Column.objects.filter(board=column.board, id__in=neighbor_ids).only(
                    "id",
                    "position",
                )
                for item in neighbors:
                    positions[item.id] = item.position

            before_pos = positions.get(int(before_id)) if before_id is not None else None
            after_pos = positions.get(int(after_id)) if after_id is not None else None

            if before_pos is not None and after_pos is not None:
                new_position = (before_pos + after_pos) / Decimal("2")
            elif before_pos is not None:
                new_position = before_pos + Decimal("1")
            elif after_pos is not None:
                new_position = after_pos - Decimal("1")
            else:
                last = Column.objects.filter(board=column.board).order_by("-position").first()
                new_position = (last.position + Decimal("1")) if last else Decimal("1")

            column.position = new_position
            column.save()

        column = Column.objects.select_related("board").get(pk=column.pk)
        serializer = self.get_serializer(column)
        actor = request.user if request.user.is_authenticated else None
        create_notification_event(
            event_type=NotificationEventType.COLUMN_UPDATED.value,
            actor=actor,
            board=column.board,
            column=column,
            summary=f"Перемещена колонка «{column.name}»",
            payload={"board": column.board.name, "column": column.name},
        )
        broadcast_board_event(column.board_id, "column.updated", {"column": serializer.data})
        return Response(serializer.data)
