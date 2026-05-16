from __future__ import annotations

from typing import Any

from rest_framework import serializers

from ..models import (
    CardDeadlineReminder,
    NotificationChannel,
    NotificationEventType,
    NotificationInboxEntry,
    NotificationPreference,
    NotificationProfile,
)


class NotificationProfileSerializer(serializers.ModelSerializer[NotificationProfile]):
    class Meta:
        model = NotificationProfile
        fields = [
            "email",
            "telegram_chat_id",
            "fcm_token",
            "timezone",
            "timezone_configured",
        ]
        read_only_fields = ["timezone_configured"]

    def update(
        self,
        instance: NotificationProfile,
        validated_data: dict[str, Any],
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
        fcm_token = validated_data.get("fcm_token")
        if fcm_token is not None:
            instance.fcm_token = str(fcm_token).strip()
            update_fields.append("fcm_token")
        tz = validated_data.get("timezone")
        if tz is not None:
            instance.timezone = str(tz).strip() or "UTC"
            instance.timezone_configured = True
            update_fields.extend(["timezone", "timezone_configured"])
        if update_fields:
            instance.save(update_fields=update_fields)
        return instance


def _build_notification_message(entry: NotificationInboxEntry) -> str:
    event = entry.event
    payload = event.payload or {}
    lines = [event.summary]
    board = payload.get("board") or (event.board.name if event.board else "")
    column = payload.get("column") or (event.column.name if event.column else "")
    card = payload.get("card") or (event.card.title if event.card else "")
    if board:
        lines.append(f"Доска: {board}")
    if column:
        lines.append(f"Колонка: {column}")
    if card:
        lines.append(f"Карточка: {card}")
    changes = payload.get("changes")
    if isinstance(changes, list):
        rendered_changes = [str(item).strip() for item in changes if str(item).strip()]
        if rendered_changes:
            lines.extend(["Изменения:", *rendered_changes])
    description = payload.get("description")
    if isinstance(description, str) and description.strip():
        lines.append(f"Описание: {description.strip()}")
    return "\n".join(lines)


def _build_notification_route(entry: NotificationInboxEntry) -> str:
    event = entry.event
    if event.board_id and event.card_id:
        return f"/boards/{event.board_id}/cards/{event.card_id}"
    if event.board_id:
        return f"/boards/{event.board_id}"
    return "/"


class NotificationInboxEntrySerializer(serializers.ModelSerializer[NotificationInboxEntry]):
    event_id = serializers.IntegerField(read_only=True)
    event_type = serializers.CharField(source="event.event_type", read_only=True)
    summary = serializers.CharField(source="event.summary", read_only=True)
    link = serializers.CharField(source="event.link", read_only=True)
    created_at = serializers.SerializerMethodField()
    unread = serializers.SerializerMethodField()
    message = serializers.SerializerMethodField()
    route = serializers.SerializerMethodField()

    class Meta:
        model = NotificationInboxEntry
        fields = [
            "id",
            "event_id",
            "event_type",
            "summary",
            "message",
            "link",
            "route",
            "created_at",
            "read_at",
            "unread",
        ]
        read_only_fields = fields

    def get_unread(self, obj: NotificationInboxEntry) -> bool:
        return obj.read_at is None

    def get_created_at(self, obj: NotificationInboxEntry) -> object:
        return obj.event.created_at

    def get_message(self, obj: NotificationInboxEntry) -> str:
        return _build_notification_message(obj)

    def get_route(self, obj: NotificationInboxEntry) -> str:
        return _build_notification_route(obj)


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
            NotificationChannel.PUSH,
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
