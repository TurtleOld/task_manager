from __future__ import annotations

from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion
import django.utils.timezone


class Migration(migrations.Migration):
    dependencies = [
        ("kanban", "0006_merge_20260205_1410"),
    ]

    operations = [
        migrations.CreateModel(
            name="NotificationProfile",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("email", models.EmailField(blank=True, default="", max_length=254)),
                ("telegram_chat_id", models.CharField(blank=True, default="", max_length=64)),
                (
                    "user",
                    models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, to=settings.AUTH_USER_MODEL),
                ),
            ],
            options={
                "ordering": ["id"],
            },
        ),
        migrations.CreateModel(
            name="NotificationEvent",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                (
                    "event_type",
                    models.CharField(
                        choices=[
                            ("board.created", "Board created"),
                            ("board.updated", "Board updated"),
                            ("board.deleted", "Board deleted"),
                            ("column.created", "Column created"),
                            ("column.updated", "Column updated"),
                            ("column.deleted", "Column deleted"),
                            ("card.created", "Card created"),
                            ("card.updated", "Card updated"),
                            ("card.deleted", "Card deleted"),
                            ("card.moved", "Card moved"),
                        ],
                        max_length=50,
                    ),
                ),
                ("summary", models.CharField(max_length=300)),
                ("link", models.URLField(blank=True, default="", max_length=500)),
                ("payload", models.JSONField(blank=True, default=dict)),
                ("created_at", models.DateTimeField(default=django.utils.timezone.now, editable=False)),
                (
                    "actor",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="notification_events",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
                (
                    "board",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        to="kanban.board",
                    ),
                ),
                (
                    "column",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        to="kanban.column",
                    ),
                ),
                (
                    "card",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        to="kanban.card",
                    ),
                ),
            ],
            options={
                "ordering": ["-created_at"],
            },
        ),
        migrations.CreateModel(
            name="NotificationPreference",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                (
                    "channel",
                    models.CharField(choices=[("email", "Email"), ("telegram", "Telegram")], max_length=20),
                ),
                (
                    "event_type",
                    models.CharField(
                        choices=[
                            ("board.created", "Board created"),
                            ("board.updated", "Board updated"),
                            ("board.deleted", "Board deleted"),
                            ("column.created", "Column created"),
                            ("column.updated", "Column updated"),
                            ("column.deleted", "Column deleted"),
                            ("card.created", "Card created"),
                            ("card.updated", "Card updated"),
                            ("card.deleted", "Card deleted"),
                            ("card.moved", "Card moved"),
                        ],
                        max_length=50,
                    ),
                ),
                ("enabled", models.BooleanField(default=True)),
                (
                    "board",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.CASCADE,
                        to="kanban.board",
                    ),
                ),
                (
                    "user",
                    models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, to=settings.AUTH_USER_MODEL),
                ),
            ],
            options={
                "ordering": ["user_id", "board_id", "channel", "event_type"],
                "unique_together": {("user", "board", "channel", "event_type")},
            },
        ),
        migrations.CreateModel(
            name="NotificationDelivery",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                (
                    "channel",
                    models.CharField(choices=[("email", "Email"), ("telegram", "Telegram")], max_length=20),
                ),
                (
                    "status",
                    models.CharField(
                        choices=[("queued", "Queued"), ("sent", "Sent"), ("failed", "Failed")],
                        default="queued",
                        max_length=20,
                    ),
                ),
                ("error", models.TextField(blank=True, default="")),
                ("sent_at", models.DateTimeField(blank=True, null=True)),
                (
                    "event",
                    models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, to="kanban.notificationevent"),
                ),
                (
                    "user",
                    models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, to=settings.AUTH_USER_MODEL),
                ),
            ],
            options={
                "ordering": ["-id"],
            },
        ),
        migrations.AddIndex(
            model_name="notificationpreference",
            index=models.Index(fields=["user", "board"], name="kanban_noti_user_id_e6f7f8_idx"),
        ),
        migrations.AddIndex(
            model_name="notificationpreference",
            index=models.Index(fields=["event_type", "channel"], name="kanban_noti_event_t_4e1ea4_idx"),
        ),
        migrations.AddIndex(
            model_name="notificationevent",
            index=models.Index(fields=["event_type", "created_at"], name="kanban_noti_event_t_44ab77_idx"),
        ),
        migrations.AddIndex(
            model_name="notificationevent",
            index=models.Index(fields=["board", "created_at"], name="kanban_noti_board_i_1f28a3_idx"),
        ),
        migrations.AddIndex(
            model_name="notificationdelivery",
            index=models.Index(fields=["status"], name="kanban_noti_status_6a4db9_idx"),
        ),
        migrations.AddIndex(
            model_name="notificationdelivery",
            index=models.Index(fields=["user", "channel"], name="kanban_noti_user_id_8c35d4_idx"),
        ),
    ]
