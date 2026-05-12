from __future__ import annotations

from django.utils import timezone
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.request import Request
from rest_framework.response import Response

from ..board_templates import create_board_from_template, list_board_templates
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
        self._notify_board_created(board)

    def _notify_board_created(self, board: Board) -> None:
        actor = self.request.user if self.request.user.is_authenticated else None
        create_notification_event(
            event_type=NotificationEventType.BOARD_CREATED.value,
            actor=actor,
            board=board,
            summary=f"Создана доска «{board.name}»",
            payload={"board": board.name},
        )
        broadcast_board_event(board.id, "board.created", {"board": BoardSerializer(board).data})

    @action(detail=False, methods=["get"], url_path="templates")
    def templates(self, request: Request) -> Response:
        return Response(list_board_templates())

    @action(detail=False, methods=["post"], url_path="from-template")
    def from_template(self, request: Request) -> Response:
        payload = request.data or {}
        template_id = str(payload.get("template_id", "")).strip()
        name = str(payload.get("name", "")).strip() or None
        try:
            board = create_board_from_template(template_id, name=name)
        except KeyError:
            return Response({"detail": "Template not found"}, status=status.HTTP_404_NOT_FOUND)

        self._notify_board_created(board)
        return Response(BoardSerializer(board).data, status=status.HTTP_201_CREATED)

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
        instance.delete()
        create_notification_event(
            event_type=NotificationEventType.BOARD_DELETED.value,
            actor=actor,
            board=None,
            summary=summary,
            payload=payload,
        )
        broadcast_board_event(board_id, "board.deleted", {"board_id": board_id})

    @action(detail=True, methods=["post"], url_path="archive")
    def archive(self, request: Request, pk: int | None = None) -> Response:
        board = self.get_object()
        board.archived_at = timezone.now()
        board.save(update_fields=["archived_at", "updated_at", "version"])
        actor = request.user if request.user.is_authenticated else None
        create_notification_event(
            event_type=NotificationEventType.BOARD_UPDATED.value,
            actor=actor,
            board=board,
            summary=f"Архивирована доска «{board.name}»",
            payload={"board": board.name},
        )
        broadcast_board_event(board.id, "board.archived", {"board_id": board.id})
        return Response(BoardSerializer(board).data)

    @action(detail=True, methods=["post"], url_path="unarchive")
    def unarchive(self, request: Request, pk: int | None = None) -> Response:
        board = Board.with_archived.filter(pk=pk, is_inbox=False).first()
        if board is None:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        board.archived_at = None
        board.save(update_fields=["archived_at", "updated_at", "version"])
        actor = request.user if request.user.is_authenticated else None
        create_notification_event(
            event_type=NotificationEventType.BOARD_UPDATED.value,
            actor=actor,
            board=board,
            summary=f"Восстановлена доска «{board.name}»",
            payload={"board": board.name},
        )
        broadcast_board_event(board.id, "board.unarchived", {"board_id": board.id})
        return Response(BoardSerializer(board).data)

    @action(detail=True, methods=["delete"], url_path="force-delete")
    def force_delete(self, request: Request, pk: int | None = None) -> Response:
        """Hard-delete an archived board."""
        board = Board.with_archived.filter(pk=pk, is_inbox=False).first()
        if board is None:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        actor = request.user if request.user.is_authenticated else None
        summary = f"Удалена доска «{board.name}»"
        payload = {"board": board.name}
        board_id = board.id
        board.delete()
        create_notification_event(
            event_type=NotificationEventType.BOARD_DELETED.value,
            actor=actor,
            board=None,
            summary=summary,
            payload=payload,
        )
        broadcast_board_event(board_id, "board.deleted", {"board_id": board_id})
        return Response(status=status.HTTP_204_NO_CONTENT)
