from __future__ import annotations

from typing import Any

from rest_framework import serializers

from ..models import (
    CardDeadlineReminder,
    NotificationChannel,
    NotificationEventType,
    NotificationPreference,
    NotificationProfile,
)


class NotificationProfileSerializer(serializers.ModelSerializer[NotificationProfile]):
    class Meta:
        model = NotificationProfile
        fields = ["email", "telegram_chat_id", "onesignal_player_id", "timezone", "timezone_configured"]
        read_only_fields = ["timezone_configured"]

    def update(self, instance: NotificationProfile, validated_data: dict[str, Any]) -> NotificationProfile:
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
            "id", "order", "enabled", "offset_value", "offset_unit",
            "channel", "scheduled_at", "status", "last_error", "sent_at",
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
        if unit and unit not in {CardDeadlineReminder.Unit.MINUTES, CardDeadlineReminder.Unit.HOURS}:
            raise serializers.ValidationError({"offset_unit": "Некорректная единица"})

        channel = attrs.get("channel")
        if channel is not None and channel not in {NotificationChannel.EMAIL, NotificationChannel.TELEGRAM}:
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
