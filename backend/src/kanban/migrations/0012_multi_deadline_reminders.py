from __future__ import annotations

from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("kanban", "0011_remove_card_estimate"),
    ]

    operations = [
        migrations.AddField(
            model_name="carddeadlinereminder",
            name="order",
            field=models.PositiveIntegerField(default=1),
        ),
        migrations.AlterUniqueTogether(
            name="carddeadlinereminder",
            unique_together=set(),
        ),
    ]
