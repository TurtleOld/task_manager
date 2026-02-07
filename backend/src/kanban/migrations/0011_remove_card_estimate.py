from __future__ import annotations

from django.db import migrations


class Migration(migrations.Migration):
    dependencies = [
        ("kanban", "0010_card_deadline_reminders"),
    ]

    operations = [
        migrations.RemoveField(
            model_name="card",
            name="estimate",
        ),
    ]
