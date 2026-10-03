from django.db import migrations


def delete_push_devices(apps, schema_editor):
    # Devices predate sessions and have none to belong to; browsers with
    # notifications enabled register again on the next login.
    apps.get_model("kanban", "PushDevice").objects.all().delete()


class Migration(migrations.Migration):
    dependencies = [
        ("kanban", "0063_user_session"),
    ]

    operations = [
        migrations.RunPython(delete_push_devices, migrations.RunPython.noop),
        # rest_framework.authtoken is no longer installed, so its own
        # migrations cannot remove the table holding the old tokens.
        migrations.RunSQL("DROP TABLE IF EXISTS authtoken_token", migrations.RunSQL.noop),
    ]
