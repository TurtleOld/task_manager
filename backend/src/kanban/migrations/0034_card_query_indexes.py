from django.db import migrations, models


INDEXES = [
    (
        "card_assignee_deadline_idx",
        "kanban_card",
        ["assignee_id", "deadline"],
    ),
    (
        "card_column_archived_idx",
        "kanban_card",
        ["column_id", "archived_at"],
    ),
    (
        "card_priority_deadline_idx",
        "kanban_card",
        ["priority", "deadline"],
    ),
]


def create_indexes(apps, schema_editor):
    vendor = schema_editor.connection.vendor
    quote = schema_editor.quote_name
    for name, table, columns in INDEXES:
        column_sql = ", ".join(quote(column) for column in columns)
        concurrently = " CONCURRENTLY" if vendor == "postgresql" else ""
        schema_editor.execute(
            f"CREATE INDEX{concurrently} IF NOT EXISTS {quote(name)} "
            f"ON {quote(table)} ({column_sql})"
        )


def drop_indexes(apps, schema_editor):
    vendor = schema_editor.connection.vendor
    quote = schema_editor.quote_name
    for name, _table, _columns in reversed(INDEXES):
        concurrently = " CONCURRENTLY" if vendor == "postgresql" else ""
        schema_editor.execute(f"DROP INDEX{concurrently} IF EXISTS {quote(name)}")


class Migration(migrations.Migration):
    atomic = False

    dependencies = [
        ("kanban", "0033_card_activity"),
    ]

    operations = [
        migrations.SeparateDatabaseAndState(
            database_operations=[
                migrations.RunPython(create_indexes, drop_indexes),
            ],
            state_operations=[
                migrations.AddIndex(
                    model_name="card",
                    index=models.Index(
                        fields=["assignee", "deadline"],
                        name="card_assignee_deadline_idx",
                    ),
                ),
                migrations.AddIndex(
                    model_name="card",
                    index=models.Index(
                        fields=["column", "archived_at"],
                        name="card_column_archived_idx",
                    ),
                ),
                migrations.AddIndex(
                    model_name="card",
                    index=models.Index(
                        fields=["priority", "deadline"],
                        name="card_priority_deadline_idx",
                    ),
                ),
            ],
        ),
    ]
