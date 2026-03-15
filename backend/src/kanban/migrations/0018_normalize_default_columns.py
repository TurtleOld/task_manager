from __future__ import annotations

from decimal import Decimal

from django.db import migrations


def normalize_default_columns(apps, schema_editor):
    Board = apps.get_model("kanban", "Board")
    Column = apps.get_model("kanban", "Column")

    standard_columns = (
        ("To Do", Decimal("1"), {"is_default": True}),
        ("In Progress", Decimal("2"), {"is_default": True}),
        ("Done", Decimal("3"), {"is_default": True, "is_done": True}),
    )

    for board_id in Board.objects.values_list("id", flat=True):
        board_columns = Column.objects.filter(board_id=board_id)

        for name, position, updates in standard_columns:
            board_columns.filter(name=name, position=position).update(**updates)

        board_columns.filter(name="Done").update(is_done=True)


class Migration(migrations.Migration):
    dependencies = [
        ("kanban", "0017_column_is_done"),
    ]

    operations = [
        migrations.RunPython(
            normalize_default_columns,
            reverse_code=migrations.RunPython.noop,
        ),
    ]
