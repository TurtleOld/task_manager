from __future__ import annotations

from django.db import migrations, models
import django.db.models.deletion


def migrate_json_to_table(apps: object, schema_editor: object) -> None:
    Card = apps.get_model("kanban", "Card")  # type: ignore[attr-defined]
    ChecklistItem = apps.get_model("kanban", "ChecklistItem")  # type: ignore[attr-defined]

    items_to_create = []
    for card in Card.with_archived.only("id", "checklist").iterator():
        checklist = card.checklist or []
        if not isinstance(checklist, list):
            continue
        for idx, entry in enumerate(checklist):
            if not isinstance(entry, dict):
                continue
            text = str(entry.get("text", "")).strip()
            if not text:
                continue
            items_to_create.append(
                ChecklistItem(
                    card_id=card.id,
                    text=text,
                    done=bool(entry.get("done", False)),
                    position=idx,
                )
            )
    ChecklistItem.objects.bulk_create(items_to_create, batch_size=500)


class Migration(migrations.Migration):
    dependencies = [
        ("kanban", "0027_board_icon_color"),
    ]

    operations = [
        migrations.CreateModel(
            name="ChecklistItem",
            fields=[
                ("id", models.AutoField(auto_created=True, primary_key=True, serialize=False)),
                ("text", models.CharField(max_length=1000)),
                ("done", models.BooleanField(default=False)),
                ("position", models.PositiveIntegerField(default=0)),
                (
                    "card",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="checklist_items",
                        to="kanban.card",
                    ),
                ),
            ],
            options={
                "ordering": ["position", "id"],
            },
        ),
        migrations.AddIndex(
            model_name="checklistitem",
            index=models.Index(fields=["card", "position"], name="kanban_chec_card_id_idx"),
        ),
        migrations.RunPython(migrate_json_to_table, migrations.RunPython.noop),
        migrations.RemoveField(
            model_name="card",
            name="checklist",
        ),
    ]
