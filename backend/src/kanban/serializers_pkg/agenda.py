from __future__ import annotations

from rest_framework import serializers

from ..models import Card
from .users import UserSerializer


class AgendaUserSerializer(UserSerializer):
    """Minimal person representation for an agenda row.

    Trims `UserSerializer` down to what a row needs, which also means the
    `role`/`permissions`/`is_admin` method fields never run — no per-row
    permission lookups.
    """

    class Meta(UserSerializer.Meta):
        fields = ["id", "username", "full_name"]


class AgendaCardSerializer(serializers.ModelSerializer[Card]):
    list = serializers.IntegerField(source="board_id", read_only=True)
    assignee = AgendaUserSerializer(read_only=True)
    priority_label = serializers.CharField(source="get_priority_display", read_only=True)
    completed_by = AgendaUserSerializer(read_only=True)
    has_subtasks = serializers.BooleanField(read_only=True)
    has_checklist = serializers.BooleanField(read_only=True)
    is_recurring = serializers.BooleanField(read_only=True)

    class Meta:
        model = Card
        fields = [
            "id",
            "title",
            "list",
            "deadline",
            "priority",
            "priority_label",
            "assignee",
            "completed_at",
            "completed_by",
            "has_subtasks",
            "has_checklist",
            "is_recurring",
            "created_at",
        ]
        read_only_fields = fields
