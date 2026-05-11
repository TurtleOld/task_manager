from __future__ import annotations

from decimal import Decimal
from typing import Any

from django.contrib.auth import get_user_model
from django.db import transaction

from .models import Board, Card, Column
from .serializers import BoardSerializer, CardSerializer, ColumnSerializer

User = get_user_model()


def create_default_board_columns(board: Board) -> None:
    default_columns = [
        {"name": "To Do", "icon": "📋", "position": Decimal("1"), "is_default": True},
        {"name": "In Progress", "icon": "⚡", "position": Decimal("2"), "is_default": True},
        {
            "name": "Done",
            "icon": "✅",
            "position": Decimal("3"),
            "is_default": True,
            "is_done": True,
        },
    ]
    for column_data in default_columns:
        Column.objects.get_or_create(
            board=board,
            name=column_data["name"],
            defaults=column_data,
        )


def get_or_create_user_inbox(user: Any) -> tuple[Board, Column]:
    with transaction.atomic():
        board, _ = Board.objects.get_or_create(
            owner=user,
            is_inbox=True,
            defaults={"name": "Inbox"},
        )
        column, _ = Column.objects.get_or_create(
            board=board,
            name="Inbox",
            defaults={"icon": "📥", "position": Decimal("1"), "is_default": True},
        )
        return board, column


def serialize_inbox(user: Any) -> dict[str, Any]:
    board, column = get_or_create_user_inbox(user)
    cards = (
        Card.objects.select_related("board", "column")
        .prefetch_related("labels")
        .filter(column=column)
        .order_by("position", "id")
    )
    return {
        "board": BoardSerializer(board).data,
        "column": ColumnSerializer(column).data,
        "cards": CardSerializer(cards, many=True).data,
    }
