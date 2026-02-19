from __future__ import annotations

from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("kanban", "0012_multi_deadline_reminders"),
    ]

    operations = [
        migrations.AddField(
            model_name="board",
            name="notification_email",
            field=models.EmailField(blank=True, default="", max_length=254),
        ),
        migrations.AddField(
            model_name="board",
            name="notification_telegram_chat_id",
            field=models.CharField(blank=True, default="", max_length=64),
        ),
    ]
