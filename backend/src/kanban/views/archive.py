from __future__ import annotations

from typing import Any

from rest_framework import permissions
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from ..models import Board, Card
from ..serializers import BoardSerializer, CardSerializer


class ArchiveView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request: Request) -> Response:
        board_id = request.query_params.get("board")
        cards = (
            Card.with_archived.select_related("board")
            .prefetch_related("labels", "checklist_items")
            .filter(archived_at__isnull=False)
        )
        boards = Board.with_archived.filter(archived_at__isnull=False, is_inbox=False)

        if board_id:
            cards = cards.filter(board_id=board_id)
            boards = boards.none()

        archived_cards = list(cards.order_by("-archived_at", "id"))
        archived_boards = list(boards.order_by("-archived_at", "id"))

        return Response(
            {
                "cards": self._serialize_cards(archived_cards),
                "boards": BoardSerializer(archived_boards, many=True).data,
            }
        )

    def _serialize_cards(self, cards: list[Card]) -> list[dict[str, Any]]:
        payload = CardSerializer(cards, many=True).data
        result: list[dict[str, Any]] = []
        for card, item in zip(cards, payload, strict=True):
            data = dict(item)
            data["board_name"] = card.board.name
            result.append(data)
        return result
