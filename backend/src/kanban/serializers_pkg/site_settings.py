from __future__ import annotations

from rest_framework import serializers

from ..models import SiteSettings


class SiteSettingsSerializer(serializers.ModelSerializer[SiteSettings]):
    class Meta:
        model = SiteSettings
        fields = ["overdue_reminder_interval"]
