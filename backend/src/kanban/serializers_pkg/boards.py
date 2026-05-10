from __future__ import annotations

from typing import Any

from rest_framework import serializers

from ..models import Board


class BoardSerializer(serializers.ModelSerializer[Board]):
    class Meta:
        model = Board
        fields = ["id", "name", "created_at", "updated_at", "version"]
        read_only_fields = ["id", "created_at", "updated_at", "version"]

    def update(self, instance: Board, validated_data: dict[str, Any]) -> Board:
        name = validated_data.get("name")
        if name is not None:
            instance.name = name
        instance.save(update_fields=["name", "updated_at", "version"])
        return instance
