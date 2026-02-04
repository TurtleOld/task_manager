from __future__ import annotations

from decimal import Decimal
from typing import Any

from django.db import transaction
from django.utils.translation import gettext_lazy as _
from rest_framework import serializers

from .models import Board, Card, Column


class BoardSerializer(serializers.ModelSerializer[Board]):
    class Meta:
        model = Board
        fields = ["id", "name", "created_at", "updated_at", "version"]
        read_only_fields = ["id", "created_at", "updated_at", "version"]


class ColumnSerializer(serializers.ModelSerializer[Column]):
    class Meta:
        model = Column
        fields = [
            "id",
            "board",
            "name",
            "position",
            "created_at",
            "updated_at",
            "version",
        ]
        read_only_fields = ["id", "created_at", "updated_at", "version"]

    def create(self, validated_data: dict[str, Any]) -> Column:
        board: Board = validated_data["board"]
        last = Column.objects.filter(board=board).order_by("-position").first()
        validated_data.setdefault(
            "position", (last.position + Decimal("1")) if last else Decimal("1")
        )
        return super().create(validated_data)


class CardSerializer(serializers.ModelSerializer[Card]):
    class Meta:
        model = Card
        fields = [
            "id",
            "board",
            "column",
            "title",
            "description",
            "position",
            "created_at",
            "updated_at",
            "version",
        ]
        read_only_fields = ["id", "created_at", "updated_at", "version", "board"]

    def validate(self, attrs: dict[str, Any]) -> dict[str, Any]:
        column: Column | None = attrs.get("column")
        if column is None:
            return attrs
        # Ensure board is aligned with column
        attrs["board"] = column.board
        return attrs

    def create(self, validated_data: dict[str, Any]) -> Card:
        column: Column = validated_data["column"]
        last = Card.objects.filter(column=column).order_by("-position").first()
        validated_data.setdefault(
            "position", (last.position + Decimal("1")) if last else Decimal("1")
        )
        validated_data["board"] = column.board
        return super().create(validated_data)
