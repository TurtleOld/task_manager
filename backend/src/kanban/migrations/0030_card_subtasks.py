import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("kanban", "0029_board_archive"),
    ]

    operations = [
        migrations.AddField(
            model_name="card",
            name="parent",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name="subtasks",
                to="kanban.card",
            ),
        ),
        migrations.AddIndex(
            model_name="card",
            index=models.Index(
                fields=["parent", "position"],
                name="kanban_card_parent__5f29f0_idx",
            ),
        ),
    ]
