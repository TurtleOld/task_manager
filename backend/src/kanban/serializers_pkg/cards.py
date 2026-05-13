from __future__ import annotations

from decimal import Decimal
from typing import Any

from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import serializers

from ..models import (
    Card,
    CardActivity,
    CardComment,
    ChecklistItem,
    Column,
    Label,
    RecurrenceFrequency,
    RecurrenceRule,
)

User = get_user_model()


def _hash_color(name: str) -> str:
    palette = [
        "#3b82f6",
        "#10b981",
        "#f59e0b",
        "#ef4444",
        "#8b5cf6",
        "#ec4899",
        "#14b8a6",
        "#f97316",
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


class ChecklistItemSerializer(serializers.ModelSerializer[ChecklistItem]):
    class Meta:
        model = ChecklistItem
        fields = ["id", "text", "done", "position"]
        read_only_fields = ["id"]


class RecurrenceRuleSerializer(serializers.ModelSerializer[RecurrenceRule]):
    class Meta:
        model = RecurrenceRule
        fields = [
            "id",
            "card",
            "freq",
            "interval",
            "byweekday",
            "byday",
            "until",
            "count",
            "generated_count",
            "next_due",
            "last_generated_at",
            "created_at",
            "updated_at",
            "version",
        ]
        read_only_fields = [
            "id",
            "card",
            "generated_count",
            "last_generated_at",
            "created_at",
            "updated_at",
            "version",
        ]

    def validate_interval(self, value: int) -> int:
        if value < 1 or value > 365:
            raise serializers.ValidationError("Interval must be between 1 and 365.")
        return value

    def validate_byweekday(self, value: Any) -> list[int]:
        if value in (None, ""):
            return []
        if not isinstance(value, list):
            raise serializers.ValidationError("byweekday must be a list.")
        result: list[int] = []
        for item in value:
            try:
                weekday = int(item)
            except (TypeError, ValueError) as exc:
                raise serializers.ValidationError("Weekday must be an integer 0..6.") from exc
            if weekday < 0 or weekday > 6:
                raise serializers.ValidationError("Weekday must be an integer 0..6.")
            if weekday not in result:
                result.append(weekday)
        return result

    def validate_byday(self, value: int | None) -> int | None:
        if value is not None and (value < 1 or value > 31):
            raise serializers.ValidationError("byday must be between 1 and 31.")
        return value

    def validate(self, attrs: dict[str, Any]) -> dict[str, Any]:
        freq = attrs.get("freq") or getattr(self.instance, "freq", None)
        if freq not in RecurrenceFrequency.values:
            raise serializers.ValidationError({"freq": "Unsupported recurrence frequency."})
        if attrs.get("count") is not None and attrs["count"] < 1:
            raise serializers.ValidationError({"count": "Count must be positive."})
        return attrs


class CardCommentSerializer(serializers.ModelSerializer[CardComment]):
    author_name = serializers.SerializerMethodField()
    author_username = serializers.CharField(source="author.username", read_only=True)
    can_edit = serializers.SerializerMethodField()

    class Meta:
        model = CardComment
        fields = [
            "id",
            "card",
            "author",
            "author_name",
            "author_username",
            "text",
            "created_at",
            "edited_at",
            "can_edit",
        ]
        read_only_fields = [
            "id",
            "card",
            "author",
            "author_name",
            "author_username",
            "created_at",
            "edited_at",
            "can_edit",
        ]

    def get_author_name(self, obj: CardComment) -> str:
        full_name = getattr(obj.author, "first_name", "") or ""
        return full_name or obj.author.username

    def get_can_edit(self, obj: CardComment) -> bool:
        request = self.context.get("request")
        user = getattr(request, "user", None)
        return bool(user and user.is_authenticated and obj.author_id == user.id)

    def validate_text(self, value: str) -> str:
        text = value.strip()
        if not text:
            raise serializers.ValidationError("Comment text cannot be empty.")
        if len(text) > 5000:
            raise serializers.ValidationError("Comment text is too long.")
        return text


class CardActivitySerializer(serializers.ModelSerializer[CardActivity]):
    actor_name = serializers.SerializerMethodField()
    actor_username = serializers.CharField(source="actor.username", read_only=True, allow_null=True)

    class Meta:
        model = CardActivity
        fields = [
            "id",
            "card",
            "actor",
            "actor_name",
            "actor_username",
            "action",
            "before",
            "after",
            "created_at",
        ]
        read_only_fields = fields

    def get_actor_name(self, obj: CardActivity) -> str:
        if obj.actor is None:
            return "Система"
        full_name = getattr(obj.actor, "first_name", "") or ""
        return full_name or obj.actor.username


class CardSerializer(serializers.ModelSerializer[Card]):
    assignee = serializers.PrimaryKeyRelatedField(
        queryset=User.objects.all(),
        allow_null=True,
        required=False,
    )
    labels = CardLabelField(required=False)
    priority_label = serializers.CharField(source="get_priority_display", read_only=True)
    checklist = serializers.SerializerMethodField()
    subtasks = serializers.SerializerMethodField()
    is_done = serializers.BooleanField(source="column.is_done", read_only=True)
    recurrence = serializers.SerializerMethodField()

    class Meta:
        model = Card
        fields = [
            "id",
            "board",
            "column",
            "assignee",
            "title",
            "description",
            "deadline",
            "priority",
            "priority_label",
            "labels",
            "checklist",
            "attachments",
            "position",
            "created_at",
            "updated_at",
            "version",
            "archived_at",
            "parent",
            "subtasks",
            "is_done",
            "parent_recurrence",
            "recurrence",
        ]
        read_only_fields = [
            "id",
            "created_at",
            "updated_at",
            "version",
            "board",
            "priority_label",
            "archived_at",
            "checklist",
            "subtasks",
            "is_done",
            "parent_recurrence",
            "recurrence",
        ]

    def get_checklist(self, obj: Card) -> list[dict[str, Any]]:
        # checklist_items is prefetched in the viewset queryset
        items = getattr(obj, "_prefetched_objects_cache", {}).get("checklist_items")
        if items is None:
            items = obj.checklist_items.order_by("position", "id")
        return ChecklistItemSerializer(items, many=True).data

    def get_subtasks(self, obj: Card) -> list[dict[str, Any]]:
        subtasks = getattr(obj, "_prefetched_objects_cache", {}).get("subtasks")
        if subtasks is None:
            subtasks = obj.subtasks.order_by("position", "id")
        return CardShallowSerializer(subtasks, many=True, context=self.context).data

    def get_recurrence(self, obj: Card) -> dict[str, Any] | None:
        rule = getattr(obj, "recurrence_rule", None)
        if rule is None:
            return None
        return RecurrenceRuleSerializer(rule, context=self.context).data

    def validate(self, attrs: dict[str, Any]) -> dict[str, Any]:
        column: Column | None = attrs.get("column")
        if column is not None:
            attrs["board"] = column.board

        parent: Card | None = attrs.get("parent")
        instance = getattr(self, "instance", None)
        if parent is not None:
            if instance is not None and parent.pk == instance.pk:
                raise serializers.ValidationError({"parent": "A card cannot be its own parent."})
            if parent.parent_id is not None:
                raise serializers.ValidationError(
                    {"parent": "Only two subtask levels are allowed."}
                )
            target_column = column or getattr(instance, "column", None)
            if target_column is not None and parent.board_id != target_column.board_id:
                raise serializers.ValidationError(
                    {"parent": "Subtask must belong to the same board."}
                )
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
        try:
            card.full_clean(exclude=["labels"])
        except DjangoValidationError as exc:
            card.delete()
            raise serializers.ValidationError(exc.message_dict) from exc
        if labels is not None:
            card.labels.set(labels)
        return card

    def update(self, instance: Card, validated_data: dict[str, Any]) -> Card:
        labels = validated_data.pop("labels", None)
        card = super().update(instance, validated_data)
        try:
            card.full_clean(exclude=["labels"])
        except DjangoValidationError as exc:
            raise serializers.ValidationError(exc.message_dict) from exc
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


class CardShallowSerializer(CardSerializer):
    class Meta(CardSerializer.Meta):
        fields = [field for field in CardSerializer.Meta.fields if field != "subtasks"]
