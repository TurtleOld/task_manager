import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("kanban", "0064_drop_tokens_and_push_devices"),
    ]

    operations = [
        migrations.AddField(
            model_name="pushdevice",
            name="session",
            field=models.ForeignKey(
                default="",
                on_delete=django.db.models.deletion.CASCADE,
                related_name="push_devices",
                to="kanban.usersession",
            ),
            preserve_default=False,
        ),
    ]
