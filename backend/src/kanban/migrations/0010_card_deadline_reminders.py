from __future__ import annotations

import django.db.models.deletion
import django.utils.timezone
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("kanban", "0009_notificationevent_dedupe_key"),
    ]

    operations = [
        migrations.AddField(
            model_name="notificationprofile",
            name="timezone",
            field=models.CharField(blank=True, default="UTC", max_length=64),
        ),
        migrations.CreateModel(
            name="CardDeadlineReminder",
            fields=[
                (
                    "id",
                    models.BigAutoField(
                        auto_created=True, primary_key=True, serialize=False, verbose_name="ID"
                    ),
                ),
                (
                    "created_at",
                    models.DateTimeField(default=django.utils.timezone.now, editable=False),
                ),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("version", models.PositiveIntegerField(default=1)),
                ("enabled", models.BooleanField(default=False)),
                ("offset_value", models.PositiveIntegerField(default=20)),
                (
                    "offset_unit",
                    models.CharField(
                        choices=[("minutes", "Minutes"), ("hours", "Hours")],
                        default="minutes",
                        max_length=10,
                    ),
                ),
                (
                    "channel",
                    models.CharField(
                        blank=True,
                        choices=[("email", "Email"), ("telegram", "Telegram")],
                        max_length=20,
                        null=True,
                    ),
                ),
                ("scheduled_at", models.DateTimeField(blank=True, null=True)),
                ("schedule_token", models.UUIDField(blank=True, editable=False, null=True)),
                (
                    "status",
                    models.CharField(
                        choices=[
                            ("disabled", "Disabled"),
                            ("scheduled", "Scheduled"),
                            ("sent", "Sent"),
                            ("skipped", "Skipped"),
                            ("failed", "Failed"),
                            ("invalid.no_deadline", "Invalid: no deadline"),
                            ("invalid.past", "Invalid: time in past"),
                            ("invalid.channel", "Invalid: channel unavailable"),
                        ],
                        default="disabled",
                        max_length=30,
                    ),
                ),
                ("last_error", models.TextField(blank=True, default="")),
                ("sent_at", models.DateTimeField(blank=True, null=True)),
                (
                    "card",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="deadline_reminders",
                        to="kanban.card",
                    ),
                ),
                (
                    "user",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="card_deadline_reminders",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={
                "ordering": ["-id"],
                "unique_together": {("card", "user")},
            },
        ),
        migrations.CreateModel(
            name="CardDeadlineReminderDelivery",
            fields=[
                (
                    "id",
                    models.BigAutoField(
                        auto_created=True, primary_key=True, serialize=False, verbose_name="ID"
                    ),
                ),
                ("dedupe_key", models.CharField(max_length=200, unique=True)),
                (
                    "channel",
                    models.CharField(
                        choices=[("email", "Email"), ("telegram", "Telegram")],
                        max_length=20,
                    ),
                ),
                (
                    "status",
                    models.CharField(
                        choices=[
                            ("queued", "Queued"),
                            ("processing", "Processing"),
                            ("sent", "Sent"),
                            ("failed", "Failed"),
                        ],
                        default="queued",
                        max_length=20,
                    ),
                ),
                ("error", models.TextField(blank=True, default="")),
                ("started_at", models.DateTimeField(blank=True, null=True)),
                ("sent_at", models.DateTimeField(blank=True, null=True)),
                (
                    "card",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE, to="kanban.card"
                    ),
                ),
                (
                    "reminder",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="deliveries",
                        to="kanban.carddeadlinereminder",
                    ),
                ),
                (
                    "user",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={
                "ordering": ["-id"],
            },
        ),
        migrations.AddIndex(
            model_name="carddeadlinereminder",
            index=models.Index(fields=["status"], name="kanban_cardd_status_3a87b9_idx"),
        ),
        migrations.AddIndex(
            model_name="carddeadlinereminder",
            index=models.Index(fields=["scheduled_at"], name="kanban_cardd_scheduled_6f29e3_idx"),
        ),
        migrations.AddIndex(
            model_name="carddeadlinereminder",
            index=models.Index(fields=["card", "user"], name="kanban_cardd_card_us_8bd79d_idx"),
        ),
        migrations.AddIndex(
            model_name="carddeadlinereminderdelivery",
            index=models.Index(fields=["status"], name="kanban_cardd_status_4fcae2_idx"),
        ),
        migrations.AddIndex(
            model_name="carddeadlinereminderdelivery",
            index=models.Index(
                fields=["reminder", "status"],
                name="kanban_cardd_rem_st_d7c91b_idx",
            ),
        ),
        migrations.AddIndex(
            model_name="carddeadlinereminderdelivery",
            index=models.Index(fields=["user", "channel"], name="kanban_cardd_user_ch_9cf0ef_idx"),
        ),
    ]
