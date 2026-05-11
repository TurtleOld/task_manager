from __future__ import annotations

from django.db import migrations


def install_pg_trgm_indexes(apps, schema_editor):
    if schema_editor.connection.vendor != "postgresql":
        return

    schema_editor.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm")
    schema_editor.execute(
        "CREATE INDEX IF NOT EXISTS kanban_card_title_trgm_idx "
        "ON kanban_card USING gin (title gin_trgm_ops)"
    )
    schema_editor.execute(
        "CREATE INDEX IF NOT EXISTS kanban_card_description_trgm_idx "
        "ON kanban_card USING gin (description gin_trgm_ops)"
    )
    schema_editor.execute(
        "CREATE INDEX IF NOT EXISTS kanban_board_name_trgm_idx "
        "ON kanban_board USING gin (name gin_trgm_ops)"
    )
    schema_editor.execute(
        "CREATE INDEX IF NOT EXISTS kanban_label_name_trgm_idx "
        "ON kanban_label USING gin (name gin_trgm_ops)"
    )


def drop_pg_trgm_indexes(apps, schema_editor):
    if schema_editor.connection.vendor != "postgresql":
        return

    schema_editor.execute("DROP INDEX IF EXISTS kanban_card_title_trgm_idx")
    schema_editor.execute("DROP INDEX IF EXISTS kanban_card_description_trgm_idx")
    schema_editor.execute("DROP INDEX IF EXISTS kanban_board_name_trgm_idx")
    schema_editor.execute("DROP INDEX IF EXISTS kanban_label_name_trgm_idx")


class Migration(migrations.Migration):
    dependencies = [
        ("kanban", "0025_archive_soft_delete"),
    ]

    operations = [
        migrations.RunPython(install_pg_trgm_indexes, drop_pg_trgm_indexes),
    ]
