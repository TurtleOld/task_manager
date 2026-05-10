from __future__ import annotations

from decimal import Decimal
from typing import Any

from rest_framework import serializers

from ..models import Board, Column


class ColumnSerializer(serializers.ModelSerializer[Column]):
    class Meta:
        model = Column
        fields = [
            "id", "board", "name", "icon", "position",
            "is_default", "is_done", "created_at", "updated_at", "version",
        ]
        read_only_fields = ["id", "is_default", "is_done", "created_at", "updated_at", "version"]

    def create(self, validated_data: dict[str, Any]) -> Column:
        board: Board = validated_data["board"]
        last = Column.objects.filter(board=board).order_by("-position").first()
        validated_data.setdefault("position", (last.position + Decimal("1")) if last else Decimal("1"))
        return super().create(validated_data)
