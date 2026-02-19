from __future__ import annotations

from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("kanban", "0013_board_notification_contacts"),
    ]

    operations = [
        migrations.AddField(
            model_name="notificationprofile",
            name="onesignal_player_id",
            field=models.CharField(blank=True, default="", max_length=200),
        ),
        migrations.AlterField(
            model_name="notificationpreference",
            name="channel",
            field=models.CharField(
                choices=[("email", "Email"), ("telegram", "Telegram"), ("push", "Push")],
                max_length=20,
            ),
        ),
        migrations.AlterField(
            model_name="notificationdelivery",
            name="channel",
            field=models.CharField(
                choices=[("email", "Email"), ("telegram", "Telegram"), ("push", "Push")],
                max_length=20,
            ),
        ),
        migrations.AlterField(
            model_name="carddeadlinereminder",
            name="channel",
            field=models.CharField(
                blank=True,
                choices=[("email", "Email"), ("telegram", "Telegram"), ("push", "Push")],
                max_length=20,
                null=True,
            ),
        ),
        migrations.AlterField(
            model_name="carddeadlinereminderdelivery",
            name="channel",
            field=models.CharField(
                choices=[("email", "Email"), ("telegram", "Telegram"), ("push", "Push")],
                max_length=20,
            ),
        ),
    ]
