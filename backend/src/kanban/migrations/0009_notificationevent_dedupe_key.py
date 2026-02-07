from __future__ import annotations

from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        (
            "kanban",
            "0008_rename_kanban_noti_status_6a4db9_idx_kanban_noti_status_5a4a41_idx_and_more",
        ),
    ]

    operations = [
        migrations.AddField(
            model_name="notificationevent",
            name="dedupe_key",
            field=models.CharField(blank=True, max_length=200, null=True, unique=True),
        ),
    ]
