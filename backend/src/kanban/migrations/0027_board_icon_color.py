from __future__ import annotations

from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("kanban", "0026_search_trigram_indexes"),
    ]

    operations = [
        migrations.AddField(
            model_name="board",
            name="icon",
            field=models.CharField(blank=True, default="📋", max_length=50),
        ),
        migrations.AddField(
            model_name="board",
            name="color",
            field=models.CharField(blank=True, default="#2563eb", max_length=9),
        ),
    ]
