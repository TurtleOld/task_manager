from django.db import migrations, models


def set_is_done_on_existing_columns(apps, schema_editor):
    Column = apps.get_model("kanban", "Column")
    Column.objects.filter(is_default=True, name="Done").update(is_done=True)


class Migration(migrations.Migration):
    dependencies = [
        ("kanban", "0016_sitesettings_column_is_default"),
    ]

    operations = [
        migrations.AddField(
            model_name="column",
            name="is_done",
            field=models.BooleanField(default=False),
        ),
        migrations.RunPython(
            set_is_done_on_existing_columns,
            reverse_code=migrations.RunPython.noop,
        ),
    ]
