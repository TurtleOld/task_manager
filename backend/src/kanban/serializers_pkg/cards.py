from __future__ import annotations

from decimal import Decimal
from typing import Any

from django.contrib.auth import get_user_model
from rest_framework import serializers

from ..models import Card, Column, Label

User = get_user_model()


def _hash_color(name: str) -> str:
    palette = [
        "#3b82f6", "#10b981", "#f59e0b", "#ef4444",
        "#8b5cf6", "#ec4899", "#14b8a6", "#f97316",
    ]
    digest = sum(ord(c) for c in name)
    return palette[digest % len(palette)]


class LabelSerializer(serializers.ModelSerializer[Label]):
    class Meta:
        model = Label
        fields = ["id", "name", "color"]
        read_only_fields = ["id"]


class CardLabelField(serializers.Field):
    default_error_messages = {
        "invalid_type": "Ожидался список",
        "invalid_item": "Каждый лейбл должен быть строкой или объектом с полем name",
        "blank_name": "Название лейбла не может быть пустым",
    }

    def to_representation(self, value: Any) -> list[dict[str, str]]:
        return [{"name": label.name, "color": label.color} for label in value.all()]

    def to_internal_value(self, data: Any) -> list[Label]:
        if not isinstance(data, list):
            self.fail("invalid_type")
        labels: list[Label] = []
        for item in data:
            if isinstance(item, str):
                name = item.strip()
                color: str | None = None
            elif isinstance(item, dict):
                name = str(item.get("name", "")).strip()
                color = item.get("color")
                color = color.strip() if isinstance(color, str) else None
            else:
                self.fail("invalid_item")
            if not name:
                self.fail("blank_name")
            label, created = Label.objects.get_or_create(
                name=name,
                defaults={"color": color or _hash_color(name)},
            )
            if color and not created and label.color != color:
                label.color = color
                label.save(update_fields=["color"])
            labels.append(label)
        return labels


class CardSerializer(serializers.ModelSerializer[Card]):
    assignee = serializers.PrimaryKeyRelatedField(
        queryset=User.objects.all(),
        allow_null=True,
        required=False,
    )
    labels = CardLabelField(required=False)
    priority_label = serializers.CharField(source="get_priority_display", read_only=True)

    class Meta:
        model = Card
        fields = [
            "id", "board", "column", "assignee", "title", "description",
            "deadline", "priority", "priority_label", "labels",
            "checklist", "attachments", "position", "created_at", "updated_at", "version",
            "archived_at",
        ]
        read_only_fields = [
            "id", "created_at", "updated_at", "version", "board", "priority_label", "archived_at",
        ]

    def validate(self, attrs: dict[str, Any]) -> dict[str, Any]:
        column: Column | None = attrs.get("column")
        if column is None:
            return attrs
        attrs["board"] = column.board
        return attrs

    def create(self, validated_data: dict[str, Any]) -> Card:
        labels = validated_data.pop("labels", None)
        column: Column = validated_data["column"]
        last = Card.objects.filter(column=column).order_by("-position").first()
        validated_data.setdefault(
            "position",
            (last.position + Decimal("1")) if last else Decimal("1"),
        )
        validated_data["board"] = column.board
        card = super().create(validated_data)
        if labels is not None:
            card.labels.set(labels)
        return card

    def update(self, instance: Card, validated_data: dict[str, Any]) -> Card:
        labels = validated_data.pop("labels", None)
        card = super().update(instance, validated_data)
        if labels is not None:
            card.labels.set(labels)
        return card

    def to_representation(self, instance: Card) -> dict[str, Any]:
        data = super().to_representation(instance)
        attachments = data.get("attachments")
        if isinstance(attachments, list):
            for item in attachments:
                if isinstance(item, dict):
                    item.pop("path", None)
        return data
