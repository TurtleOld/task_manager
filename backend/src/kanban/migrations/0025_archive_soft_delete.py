from __future__ import annotations

from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("kanban", "0024_board_inbox"),
    ]

    operations = [
        migrations.AddField(
            model_name="column",
            name="archived_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="card",
            name="archived_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
    ]
