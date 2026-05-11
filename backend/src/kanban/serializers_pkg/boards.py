from __future__ import annotations

from typing import Any

from rest_framework import serializers

from ..models import Board


class BoardSerializer(serializers.ModelSerializer[Board]):
    class Meta:
        model = Board
        fields = ["id", "name", "icon", "color", "archived_at", "created_at", "updated_at", "version"]
        read_only_fields = ["id", "archived_at", "created_at", "updated_at", "version"]

    def update(self, instance: Board, validated_data: dict[str, Any]) -> Board:
        name = validated_data.get("name")
        if name is not None:
            instance.name = name
        icon = validated_data.get("icon")
        if icon is not None:
            instance.icon = icon
        color = validated_data.get("color")
        if color is not None:
            instance.color = color
        instance.save(update_fields=["name", "icon", "color", "updated_at", "version"])
        return instance
