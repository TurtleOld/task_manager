from __future__ import annotations

from typing import Any

from django.db.models import Q
from rest_framework import permissions
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from ..models import Board, Card


class SearchView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request: Request) -> Response:
        query = str(request.query_params.get("q", "")).strip()
        if len(query) < 2:
            return Response({"cards": [], "boards": []})

        boards = list(
            Board.objects.filter(is_inbox=False, name__icontains=query).order_by("name", "id")[:8]
        )
        cards = list(
            Card.objects.select_related("board", "column")
            .prefetch_related("labels")
            .filter(
                board__is_inbox=False,
            )
            .filter(
                Q(title__icontains=query)
                | Q(description__icontains=query)
                | Q(labels__name__icontains=query)
                | Q(board__name__icontains=query)
            )
            .distinct()
            .order_by("deadline", "position", "id")[:12]
        )

        return Response({
            "cards": [self._card_result(card) for card in cards],
            "boards": [self._board_result(board) for board in boards],
        })

    def _card_result(self, card: Card) -> dict[str, Any]:
        return {
            "id": card.id,
            "title": card.title,
            "description": card.description,
            "board": card.board_id,
            "board_name": card.board.name,
            "column": card.column_id,
            "column_name": card.column.name,
            "deadline": card.deadline,
            "priority": card.priority,
        }

    def _board_result(self, board: Board) -> dict[str, Any]:
        return {
            "id": board.id,
            "name": board.name,
        }
