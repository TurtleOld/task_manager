from __future__ import annotations

from django.db import migrations, models


def mark_existing_profiles_configured(apps, schema_editor):
    NotificationProfile = apps.get_model("kanban", "NotificationProfile")
    NotificationProfile.objects.update(timezone_configured=True)


class Migration(migrations.Migration):
    dependencies = [
        ("kanban", "0018_normalize_default_columns"),
    ]

    operations = [
        migrations.AddField(
            model_name="notificationprofile",
            name="timezone_configured",
            field=models.BooleanField(default=False),
        ),
        migrations.RunPython(
            mark_existing_profiles_configured,
            reverse_code=migrations.RunPython.noop,
        ),
    ]
