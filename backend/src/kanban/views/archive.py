from __future__ import annotations

from typing import Any

from rest_framework import permissions
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from ..models import Card, Column
from ..serializers import CardSerializer, ColumnSerializer


class ArchiveView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request: Request) -> Response:
        board_id = request.query_params.get("board")
        cards = (
            Card.with_archived.select_related("board", "column")
            .prefetch_related("labels", "checklist_items")
            .filter(archived_at__isnull=False)
        )
        columns = Column.with_archived.select_related("board").filter(archived_at__isnull=False)

        if board_id:
            cards = cards.filter(board_id=board_id)
            columns = columns.filter(board_id=board_id)

        archived_cards = list(cards.order_by("-archived_at", "id"))
        archived_columns = list(columns.order_by("-archived_at", "id"))

        return Response({
            "cards": self._serialize_cards(archived_cards),
            "columns": self._serialize_columns(archived_columns),
        })

    def _serialize_cards(self, cards: list[Card]) -> list[dict[str, Any]]:
        payload = CardSerializer(cards, many=True).data
        result: list[dict[str, Any]] = []
        for card, item in zip(cards, payload, strict=True):
            data = dict(item)
            data["board_name"] = card.board.name
            data["column_name"] = card.column.name
            result.append(data)
        return result

    def _serialize_columns(self, columns: list[Column]) -> list[dict[str, Any]]:
        payload = ColumnSerializer(columns, many=True).data
        result: list[dict[str, Any]] = []
        for column, item in zip(columns, payload, strict=True):
            data = dict(item)
            data["board_name"] = column.board.name
            result.append(data)
        return result
