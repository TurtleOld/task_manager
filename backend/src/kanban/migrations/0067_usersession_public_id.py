import uuid

from django.db import migrations, models


def assign_public_ids(apps, schema_editor):
    UserSession = apps.get_model("kanban", "UserSession")
    for session in UserSession.objects.all().only("session_key"):
        UserSession.objects.filter(session_key=session.session_key).update(public_id=uuid.uuid4())


class Migration(migrations.Migration):
    dependencies = [
        ("kanban", "0066_dispatcherheartbeat_last_session_cleanup_at"),
    ]

    operations = [
        migrations.AddField(
            model_name="usersession",
            name="public_id",
            field=models.UUIDField(default=uuid.uuid4, editable=False),
        ),
        migrations.RunPython(assign_public_ids, migrations.RunPython.noop),
        migrations.AlterField(
            model_name="usersession",
            name="public_id",
            field=models.UUIDField(default=uuid.uuid4, editable=False, unique=True),
        ),
    ]
