from __future__ import annotations

from rest_framework import serializers

from ..models import UserSession


class UserSessionSerializer(serializers.ModelSerializer[UserSession]):
    id = serializers.UUIDField(source="public_id", read_only=True)
    label = serializers.CharField(source="user_agent_label", read_only=True)
    notifications_enabled = serializers.SerializerMethodField()
    current = serializers.SerializerMethodField()

    class Meta:
        model = UserSession
        fields = ["id", "label", "login_at", "last_activity", "notifications_enabled", "current"]
        read_only_fields = fields

    def get_notifications_enabled(self, session: UserSession) -> bool:
        return bool(session.has_device)

    def get_current(self, session: UserSession) -> bool:
        return session.session_key == self.context.get("current_session_key")
