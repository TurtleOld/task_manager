from __future__ import annotations

from decimal import Decimal
from typing import Any

from django.contrib.auth import get_user_model
from django.contrib.auth.models import AbstractUser, Permission
from django.contrib.auth.password_validation import validate_password
from django.db import models
from django.utils.translation import gettext_lazy as _
from rest_framework import serializers

from .models import (
    Board,
    Card,
    CardDeadlineReminder,
    Category,
    Column,
    NotificationChannel,
    NotificationEventType,
    NotificationPreference,
    NotificationProfile,
    Tag,
)

User = get_user_model()


class BoardSerializer(serializers.ModelSerializer[Board]):
    class Meta:
        model = Board
        fields = [
            "id",
            "name",
            "notification_email",
            "notification_telegram_chat_id",
            "created_at",
            "updated_at",
            "version",
        ]
        read_only_fields = ["id", "created_at", "updated_at", "version"]

    def update(self, instance: Board, validated_data: dict[str, Any]) -> Board:
        name = validated_data.get("name")
        if name is not None:
            instance.name = name
        notification_email = validated_data.get("notification_email")
        if notification_email is not None:
            instance.notification_email = notification_email.strip()
        notification_telegram_chat_id = validated_data.get("notification_telegram_chat_id")
        if notification_telegram_chat_id is not None:
            instance.notification_telegram_chat_id = notification_telegram_chat_id.strip()
        instance.save(
            update_fields=[
                "name",
                "notification_email",
                "notification_telegram_chat_id",
                "updated_at",
                "version",
            ]
        )
        return instance


class ColumnSerializer(serializers.ModelSerializer[Column]):
    class Meta:
        model = Column
        fields = [
            "id",
            "board",
            "name",
            "icon",
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


class NameRelatedField(serializers.SlugRelatedField):
    def to_internal_value(self, data: Any) -> models.Model:
        if not isinstance(data, str):
            raise serializers.ValidationError("Ожидалась строка")
        value = data.strip()
        if not value:
            raise serializers.ValidationError("Название не может быть пустым")
        obj, _ = self.get_queryset().get_or_create(**{self.slug_field: value})
        return obj


class TagSerializer(serializers.ModelSerializer[Tag]):
    class Meta:
        model = Tag
        fields = ["id", "name"]
        read_only_fields = ["id"]


class CategorySerializer(serializers.ModelSerializer[Category]):
    class Meta:
        model = Category
        fields = ["id", "name"]
        read_only_fields = ["id"]


class CardSerializer(serializers.ModelSerializer[Card]):
    assignee = serializers.PrimaryKeyRelatedField(
        queryset=User.objects.all(), allow_null=True, required=False
    )
    tags = NameRelatedField(
        many=True, slug_field="name", queryset=Tag.objects.all(), required=False
    )
    categories = NameRelatedField(
        many=True, slug_field="name", queryset=Category.objects.all(), required=False
    )

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
            "tags",
            "categories",
            "checklist",
            "attachments",
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
        tags = validated_data.pop("tags", None)
        categories = validated_data.pop("categories", None)
        column: Column = validated_data["column"]
        last = Card.objects.filter(column=column).order_by("-position").first()
        validated_data.setdefault(
            "position", (last.position + Decimal("1")) if last else Decimal("1")
        )
        validated_data["board"] = column.board
        card = super().create(validated_data)
        if tags is not None:
            card.tags.set(tags)
        if categories is not None:
            card.categories.set(categories)
        return card

    def update(self, instance: Card, validated_data: dict[str, Any]) -> Card:
        tags = validated_data.pop("tags", None)
        categories = validated_data.pop("categories", None)
        card = super().update(instance, validated_data)
        if tags is not None:
            card.tags.set(tags)
        if categories is not None:
            card.categories.set(categories)
        return card

    def to_representation(self, instance: Card) -> dict[str, Any]:
        data = super().to_representation(instance)
        # Do not leak internal storage paths (used only for server-side deletes).
        attachments = data.get("attachments")
        if isinstance(attachments, list):
            for item in attachments:
                if isinstance(item, dict):
                    item.pop("path", None)
        return data


PERMISSION_MAP: dict[str, tuple[str, str]] = {
    "boards:view": ("kanban", "view_board"),
    "boards:add": ("kanban", "add_board"),
    "boards:edit": ("kanban", "change_board"),
    "boards:delete": ("kanban", "delete_board"),
    "columns:view": ("kanban", "view_column"),
    "columns:add": ("kanban", "add_column"),
    "columns:edit": ("kanban", "change_column"),
    "columns:delete": ("kanban", "delete_column"),
    "cards:view": ("kanban", "view_card"),
    "cards:add": ("kanban", "add_card"),
    "cards:edit": ("kanban", "change_card"),
    "cards:delete": ("kanban", "delete_card"),
}

ROLE_PRESETS: dict[str, list[str]] = {
    "admin": list(PERMISSION_MAP.keys()),
    "manager": [
        "boards:view",
        "boards:add",
        "boards:edit",
        "columns:view",
        "columns:add",
        "columns:edit",
        "cards:view",
        "cards:add",
        "cards:edit",
        "cards:delete",
    ],
    "editor": [
        "boards:view",
        "columns:view",
        "columns:add",
        "columns:edit",
        "cards:view",
        "cards:add",
        "cards:edit",
    ],
    "viewer": [
        "boards:view",
        "columns:view",
        "cards:view",
    ],
}


class UserSerializer(serializers.ModelSerializer[AbstractUser]):
    full_name = serializers.CharField(source="first_name")
    is_admin = serializers.SerializerMethodField()
    role = serializers.SerializerMethodField()
    permissions = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ["id", "username", "full_name", "is_admin", "role", "permissions"]

    def get_is_admin(self, obj: AbstractUser) -> bool:
        return bool(obj.is_staff or obj.is_superuser)

    def get_role(self, obj: AbstractUser) -> str:
        if obj.is_superuser:
            return "admin"
        if obj.is_staff:
            return "manager"
        return "viewer"

    def get_permissions(self, obj: AbstractUser) -> list[str]:
        return sorted(
            [
                key
                for key, pair in PERMISSION_MAP.items()
                if obj.user_permissions.filter(
                    content_type__app_label=pair[0],
                    codename=pair[1],
                ).exists()
            ]
        )


class UserUpdateSerializer(serializers.Serializer):
    full_name = serializers.CharField(max_length=150, required=False, allow_blank=True)
    role = serializers.ChoiceField(
        choices=[
            ("admin", "admin"),
            ("manager", "manager"),
            ("editor", "editor"),
            ("viewer", "viewer"),
        ],
        required=False,
    )
    permissions = serializers.ListField(
        child=serializers.CharField(),
        required=False,
        allow_empty=True,
    )

    def validate_permissions(self, value: list[str]) -> list[str]:
        invalid = [item for item in value if item not in PERMISSION_MAP]
        if invalid:
            raise serializers.ValidationError(_("Некорректные права доступа"))
        return value

    def update(self, instance: AbstractUser, validated_data: dict[str, Any]) -> AbstractUser:
        full_name = validated_data.get("full_name")
        if full_name is not None:
            instance.first_name = full_name

        role = validated_data.get("role")
        if role is not None:
            instance.is_staff = role in {"admin", "manager"}
            instance.is_superuser = role == "admin"

        permissions = validated_data.get("permissions")
        if permissions is not None:
            permission_pairs = [PERMISSION_MAP[key] for key in permissions]
            app_labels = {app for app, _ in permission_pairs}
            codenames = [codename for _, codename in permission_pairs]
            perms = Permission.objects.filter(
                content_type__app_label__in=app_labels,
                codename__in=codenames,
            )
            instance.user_permissions.set(perms)

        instance.save()
        return instance


class PasswordChangeSerializer(serializers.Serializer):
    new_password = serializers.CharField(write_only=True, min_length=8)

    def validate_new_password(self, value: str) -> str:
        validate_password(value)
        return value

    def update(self, instance: AbstractUser, validated_data: dict[str, Any]) -> AbstractUser:
        instance.set_password(validated_data["new_password"])
        instance.save(update_fields=["password"])
        return instance


class RegisterSerializer(serializers.Serializer):
    username = serializers.CharField(max_length=150)
    password = serializers.CharField(write_only=True)
    full_name = serializers.CharField(max_length=150, required=False, allow_blank=True)
    role = serializers.ChoiceField(
        choices=[
            ("admin", "admin"),
            ("manager", "manager"),
            ("editor", "editor"),
            ("viewer", "viewer"),
        ],
        default="viewer",
        required=False,
    )
    permissions = serializers.ListField(
        child=serializers.CharField(),
        required=False,
        allow_empty=True,
    )

    def validate_username(self, value: str) -> str:
        if User.objects.filter(username=value).exists():
            raise serializers.ValidationError(_("Пользователь уже существует"))
        return value

    def validate_password(self, value: str) -> str:
        validate_password(value)
        return value

    def validate_permissions(self, value: list[str]) -> list[str]:
        invalid = [item for item in value if item not in PERMISSION_MAP]
        if invalid:
            raise serializers.ValidationError(_("Некорректные права доступа"))
        return value

    def create(self, validated_data: dict[str, Any]) -> AbstractUser:
        role = validated_data.get("role") or "viewer"
        permissions = validated_data.get("permissions")
        if permissions is None:
            permissions = ROLE_PRESETS.get(role, ROLE_PRESETS["viewer"])

        user = User(username=validated_data["username"])
        full_name = validated_data.get("full_name")
        if full_name:
            user.first_name = full_name
        user.set_password(validated_data["password"])
        user.is_staff = role in {"admin", "manager"}
        user.save()

        permission_pairs = [PERMISSION_MAP[key] for key in permissions]
        app_labels = {app for app, _ in permission_pairs}
        codenames = [codename for _, codename in permission_pairs]
        perms = Permission.objects.filter(
            content_type__app_label__in=app_labels,
            codename__in=codenames,
        )
        user.user_permissions.set(perms)
        NotificationProfile.objects.get_or_create(user=user)
        return user


class NotificationProfileSerializer(serializers.ModelSerializer[NotificationProfile]):
    class Meta:
        model = NotificationProfile
        fields = ["email", "telegram_chat_id", "onesignal_player_id", "timezone"]

    def update(
        self, instance: NotificationProfile, validated_data: dict[str, Any]
    ) -> NotificationProfile:
        email = validated_data.get("email")
        if email is not None:
            instance.email = email.strip()
        telegram_chat_id = validated_data.get("telegram_chat_id")
        if telegram_chat_id is not None:
            instance.telegram_chat_id = telegram_chat_id.strip()
        onesignal_player_id = validated_data.get("onesignal_player_id")
        if onesignal_player_id is not None:
            instance.onesignal_player_id = str(onesignal_player_id).strip()
        tz = validated_data.get("timezone")
        if tz is not None:
            instance.timezone = str(tz).strip() or "UTC"
        instance.save(
            update_fields=["email", "telegram_chat_id", "onesignal_player_id", "timezone"]
        )
        return instance


class NotificationPreferenceSerializer(serializers.ModelSerializer[NotificationPreference]):
    channel = serializers.ChoiceField(choices=NotificationChannel.choices)
    event_type = serializers.ChoiceField(choices=NotificationEventType.choices)

    class Meta:
        model = NotificationPreference
        fields = ["id", "board", "channel", "event_type", "enabled"]
        read_only_fields = ["id"]


class CardDeadlineReminderSerializer(serializers.ModelSerializer[CardDeadlineReminder]):
    class Meta:
        model = CardDeadlineReminder
        fields = [
            "id",
            "order",
            "enabled",
            "offset_value",
            "offset_unit",
            "channel",
            "scheduled_at",
            "status",
            "last_error",
            "sent_at",
        ]
        read_only_fields = ["id", "scheduled_at", "status", "last_error", "sent_at"]

    def validate_offset_value(self, value: int) -> int:
        try:
            v = int(value)
        except Exception:  # noqa: BLE001
            raise serializers.ValidationError("Должно быть целым числом")
        if v <= 0:
            raise serializers.ValidationError("Должно быть положительным числом")
        return v

    def validate(self, attrs: dict[str, Any]) -> dict[str, Any]:
        unit = attrs.get("offset_unit")
        if unit and unit not in {
            CardDeadlineReminder.Unit.MINUTES,
            CardDeadlineReminder.Unit.HOURS,
        }:
            raise serializers.ValidationError({"offset_unit": "Некорректная единица"})

        channel = attrs.get("channel")
        if channel is not None and channel not in {
            NotificationChannel.EMAIL,
            NotificationChannel.TELEGRAM,
        }:
            raise serializers.ValidationError({"channel": "Некорректный канал"})

        if self.instance is not None:
            effective_unit = unit or self.instance.offset_unit
            effective_value = attrs.get("offset_value", self.instance.offset_value)
        else:
            effective_unit = unit
            effective_value = attrs.get("offset_value")

        if effective_unit == CardDeadlineReminder.Unit.HOURS and effective_value is not None:
            if int(effective_value) > 168:
                raise serializers.ValidationError({"offset_value": "Слишком большое значение"})
        if effective_unit == CardDeadlineReminder.Unit.MINUTES and effective_value is not None:
            if int(effective_value) > 24 * 60:
                raise serializers.ValidationError({"offset_value": "Слишком большое значение"})
        return attrs
