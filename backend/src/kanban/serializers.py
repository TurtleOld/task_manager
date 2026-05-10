from __future__ import annotations

from decimal import Decimal
from typing import Any

from django.contrib.auth import get_user_model
from django.contrib.auth.models import AbstractUser, Permission
from django.contrib.auth.password_validation import validate_password
from django.utils.translation import gettext_lazy as _
from rest_framework import serializers

from .models import (
    Board,
    Card,
    CardDeadlineReminder,
    Column,
    Label,
    NotificationChannel,
    NotificationEventType,
    NotificationPreference,
    NotificationProfile,
    SiteSettings,
)

User = get_user_model()


class BoardSerializer(serializers.ModelSerializer[Board]):
    class Meta:
        model = Board
        fields = [
            "id",
            "name",
            "created_at",
            "updated_at",
            "version",
        ]
        read_only_fields = ["id", "created_at", "updated_at", "version"]

    def update(self, instance: Board, validated_data: dict[str, Any]) -> Board:
        name = validated_data.get("name")
        if name is not None:
            instance.name = name
        instance.save(update_fields=["name", "updated_at", "version"])
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
            "is_default",
            "is_done",
            "created_at",
            "updated_at",
            "version",
        ]
        read_only_fields = ["id", "is_default", "is_done", "created_at", "updated_at", "version"]

    def create(self, validated_data: dict[str, Any]) -> Column:
        board: Board = validated_data["board"]
        last = Column.objects.filter(board=board).order_by("-position").first()
        validated_data.setdefault(
            "position", (last.position + Decimal("1")) if last else Decimal("1")
        )
        return super().create(validated_data)


class LabelSerializer(serializers.ModelSerializer[Label]):
    class Meta:
        model = Label
        fields = ["id", "name", "color"]
        read_only_fields = ["id"]


class CardLabelField(serializers.Field):
    """Bi-directional translation between Card.labels (M2M) and the API
    representation `[{name, color}]`.

    On read: serialize each Label as a dict.
    On write: accept either a list of strings (legacy/simple) or a list of
    {name, color} dicts; create labels by name on first use, persisting the
    color when supplied (or leaving the auto-generated one alone otherwise).
    """

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


def _hash_color(name: str) -> str:
    """Stable hash → hex color, used when a label is created without an
    explicit color."""
    palette = [
        "#3b82f6",  # blue
        "#10b981",  # emerald
        "#f59e0b",  # amber
        "#ef4444",  # red
        "#8b5cf6",  # violet
        "#ec4899",  # pink
        "#14b8a6",  # teal
        "#f97316",  # orange
    ]
    digest = sum(ord(c) for c in name)
    return palette[digest % len(palette)]


class CardSerializer(serializers.ModelSerializer[Card]):
    assignee = serializers.PrimaryKeyRelatedField(
        queryset=User.objects.all(), allow_null=True, required=False
    )
    labels = CardLabelField(required=False)
    priority_label = serializers.CharField(source="get_priority_display", read_only=True)

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
        ]
        read_only_fields = [
            "id",
            "created_at",
            "updated_at",
            "version",
            "board",
            "priority_label",
        ]

    def validate(self, attrs: dict[str, Any]) -> dict[str, Any]:
        column: Column | None = attrs.get("column")
        if column is None:
            return attrs
        # Ensure board is aligned with column
        attrs["board"] = column.board
        return attrs

    def create(self, validated_data: dict[str, Any]) -> Card:
        labels = validated_data.pop("labels", None)
        column: Column = validated_data["column"]
        last = Card.objects.filter(column=column).order_by("-position").first()
        validated_data.setdefault(
            "position", (last.position + Decimal("1")) if last else Decimal("1")
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
        # Phase 1 (T-304): owner = full access; member = everything else.
        # is_admin and role == "owner" are synonyms going forward.
        return "owner" if (obj.is_superuser or obj.is_staff) else "member"

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
        choices=[("owner", "owner"), ("member", "member")],
        required=False,
    )

    def update(self, instance: AbstractUser, validated_data: dict[str, Any]) -> AbstractUser:
        full_name = validated_data.get("full_name")
        if full_name is not None:
            instance.first_name = full_name

        role = validated_data.get("role")
        if role is not None:
            # Owner = full admin access. Superuser flag flips with is_staff so
            # the two-role model stays a single source of truth.
            instance.is_staff = role == "owner"
            instance.is_superuser = role == "owner"

        instance.save()
        return instance


class CurrentUserUpdateSerializer(serializers.Serializer):
    full_name = serializers.CharField(max_length=150, required=False, allow_blank=True)

    def update(self, instance: AbstractUser, validated_data: dict[str, Any]) -> AbstractUser:
        full_name = validated_data.get("full_name")
        if full_name is not None:
            instance.first_name = full_name
            instance.save(update_fields=["first_name"])
        return instance


class PasswordChangeSerializer(serializers.Serializer):
    new_password = serializers.CharField(write_only=True, min_length=8)

    def validate_new_password(self, value: str) -> str:
        validate_password(value)
        return value

    def update(self, instance: AbstractUser, validated_data: dict[str, Any]) -> AbstractUser:
        validate_password(validated_data["new_password"], user=instance)
        instance.set_password(validated_data["new_password"])
        instance.save(update_fields=["password"])
        return instance


class RegisterSerializer(serializers.Serializer):
    username = serializers.CharField(max_length=150)
    password = serializers.CharField(write_only=True)
    full_name = serializers.CharField(max_length=150, required=False, allow_blank=True)
    role = serializers.ChoiceField(
        choices=[("owner", "owner"), ("member", "member")],
        default="member",
        required=False,
    )

    def validate_username(self, value: str) -> str:
        if User.objects.filter(username=value).exists():
            raise serializers.ValidationError(_("Пользователь уже существует"))
        return value

    def validate_password(self, value: str) -> str:
        validate_password(value)
        return value

    def create(self, validated_data: dict[str, Any]) -> AbstractUser:
        role = validated_data.get("role") or "member"

        user = User(username=validated_data["username"])
        full_name = validated_data.get("full_name")
        if full_name:
            user.first_name = full_name
        validate_password(validated_data["password"], user=user)
        user.set_password(validated_data["password"])
        user.is_staff = role == "owner"
        user.save()

        NotificationProfile.objects.get_or_create(user=user)
        return user


class NotificationProfileSerializer(serializers.ModelSerializer[NotificationProfile]):
    class Meta:
        model = NotificationProfile
        fields = [
            "email",
            "telegram_chat_id",
            "onesignal_player_id",
            "timezone",
            "timezone_configured",
        ]
        read_only_fields = ["timezone_configured"]

    def update(
        self, instance: NotificationProfile, validated_data: dict[str, Any]
    ) -> NotificationProfile:
        update_fields: list[str] = []
        email = validated_data.get("email")
        if email is not None:
            instance.email = email.strip()
            update_fields.append("email")
        telegram_chat_id = validated_data.get("telegram_chat_id")
        if telegram_chat_id is not None:
            instance.telegram_chat_id = telegram_chat_id.strip()
            update_fields.append("telegram_chat_id")
        onesignal_player_id = validated_data.get("onesignal_player_id")
        if onesignal_player_id is not None:
            instance.onesignal_player_id = str(onesignal_player_id).strip()
            update_fields.append("onesignal_player_id")
        tz = validated_data.get("timezone")
        if tz is not None:
            instance.timezone = str(tz).strip() or "UTC"
            instance.timezone_configured = True
            update_fields.extend(["timezone", "timezone_configured"])
        if update_fields:
            instance.save(update_fields=update_fields)
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


class SiteSettingsSerializer(serializers.ModelSerializer[SiteSettings]):
    class Meta:
        model = SiteSettings
        fields = ["overdue_reminder_interval"]
