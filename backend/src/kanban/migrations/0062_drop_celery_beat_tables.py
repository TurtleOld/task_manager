from django.db import migrations

CELERY_BEAT_TABLES = (
    "django_celery_beat_periodictask",
    "django_celery_beat_periodictasks",
    "django_celery_beat_crontabschedule",
    "django_celery_beat_intervalschedule",
    "django_celery_beat_solarschedule",
    "django_celery_beat_clockedschedule",
)


def drop_celery_beat_tables(apps, schema_editor) -> None:
    """Remove the tables and migration records of the uninstalled app."""

    for table in CELERY_BEAT_TABLES:
        schema_editor.execute(f'DROP TABLE IF EXISTS "{table}"')
    schema_editor.execute(
        "DELETE FROM django_migrations WHERE app = %s",
        params=["django_celery_beat"],
    )


class Migration(migrations.Migration):
    dependencies = [
        ("kanban", "0061_remove_deprecated_permission_grants"),
    ]

    operations = [
        migrations.RunPython(
            drop_celery_beat_tables,
            migrations.RunPython.noop,
        ),
    ]
