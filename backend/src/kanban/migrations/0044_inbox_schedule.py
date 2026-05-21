from __future__ import annotations

import django.db.models.deletion
import django.utils.timezone
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ("kanban", "0043_notification_profile_fcm_token"),
    ]

    operations = [
        migrations.CreateModel(
            name="InboxSchedule",
            fields=[
                (
                    "id",
                    models.BigAutoField(
                        auto_created=True,
                        primary_key=True,
                        serialize=False,
                        verbose_name="ID",
                    ),
                ),
                (
                    "created_at",
                    models.DateTimeField(
                        default=django.utils.timezone.now,
                        editable=False,
                    ),
                ),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("version", models.PositiveIntegerField(default=1)),
                ("move_at", models.DateTimeField()),
                (
                    "status",
                    models.CharField(
                        choices=[
                            ("scheduled", "Scheduled"),
                            ("completed", "Completed"),
                            ("cancelled", "Cancelled"),
                        ],
                        default="scheduled",
                        max_length=20,
                    ),
                ),
                ("moved_count", models.PositiveIntegerField(default=0)),
                (
                    "target_column",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="inbox_schedules",
                        to="kanban.column",
                    ),
                ),
                (
                    "user",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="inbox_schedules",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={
                "ordering": ["move_at", "id"],
            },
        ),
        migrations.AddIndex(
            model_name="inboxschedule",
            index=models.Index(
                fields=["status", "move_at"],
                name="kanban_inbo_status_4e801c_idx",
            ),
        ),
        migrations.AddIndex(
            model_name="inboxschedule",
            index=models.Index(
                fields=["user", "status", "move_at"],
                name="kanban_inbo_user_id_b40c49_idx",
            ),
        ),
    ]
