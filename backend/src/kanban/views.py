from __future__ import annotations

from decimal import Decimal
from typing import Any

from django.db import transaction
from django.http import HttpRequest
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.request import Request
from rest_framework.response import Response

from .models import Board, Card, Column
from .serializers import BoardSerializer, CardSerializer, ColumnSerializer


class BoardViewSet(viewsets.ModelViewSet[Board]):
    queryset = Board.objects.all().order_by("id")
    serializer_class = BoardSerializer


class ColumnViewSet(viewsets.ModelViewSet[Column]):
    queryset = Column.objects.select_related("board").all().order_by("position", "id")
    serializer_class = ColumnSerializer
    filterset_fields = ["board"]


class CardViewSet(viewsets.ModelViewSet[Card]):
    queryset = Card.objects.select_related("board", "column").all().order_by("position", "id")
    serializer_class = CardSerializer
    filterset_fields = ["board", "column"]

    @action(detail=True, methods=["post"], url_path="move")
    def move(self, request: Request, pk: str | None = None) -> Response:
        card = self.get_object()
        payload: dict[str, Any] = request.data or {}
        expected_version = payload.get("expected_version")
        to_column_id = payload.get("to_column")
        before_id = payload.get("before_id")
        after_id = payload.get("after_id")

        if expected_version is not None and int(expected_version) != card.version:
            return Response({"detail": "Version conflict"}, status=status.HTTP_409_CONFLICT)

        with transaction.atomic():
            if to_column_id is not None and int(to_column_id) != card.column_id:
                try:
                    target_column = Column.objects.select_for_update().get(id=int(to_column_id))
                except Column.DoesNotExist:
                    return Response({"detail": "Target column not found"}, status=404)
            else:
                target_column = Column.objects.select_for_update().get(id=card.column_id)

            def pos_of(card_id: int) -> Decimal | None:
                try:
                    c = Card.objects.select_for_update().get(id=card_id)
                    return c.position
                except Card.DoesNotExist:
                    return None

            before_pos = pos_of(int(before_id)) if before_id is not None else None
            after_pos = pos_of(int(after_id)) if after_id is not None else None

            if before_pos is not None and after_pos is not None:
                new_position = (before_pos + after_pos) / Decimal("2")
            elif before_pos is not None:
                new_position = before_pos + Decimal("1")
            elif after_pos is not None:
                new_position = after_pos - Decimal("1")
            else:
                last = Card.objects.filter(column=target_column).order_by("-position").first()
                new_position = (last.position + Decimal("1")) if last else Decimal("1")

            card.column = target_column
            card.board = target_column.board
            card.position = new_position
            card.save()

        serializer = self.get_serializer(card)
        return Response(serializer.data)
