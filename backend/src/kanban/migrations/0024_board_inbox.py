from __future__ import annotations

from decimal import Decimal

import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


def create_inboxes_for_existing_users(apps, schema_editor):
    user_app_label, user_model_name = settings.AUTH_USER_MODEL.split(".")
    User = apps.get_model(user_app_label, user_model_name)
    Board = apps.get_model("kanban", "Board")
    Column = apps.get_model("kanban", "Column")

    for user in User.objects.all():
        board, _ = Board.objects.get_or_create(
            owner=user,
            is_inbox=True,
            defaults={"name": "Inbox"},
        )
        Column.objects.get_or_create(
            board=board,
            name="Inbox",
            defaults={"icon": "📥", "position": Decimal("1"), "is_default": True},
        )


def delete_created_inboxes(apps, schema_editor):
    Board = apps.get_model("kanban", "Board")
    Board.objects.filter(is_inbox=True).delete()


class Migration(migrations.Migration):
    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ("kanban", "0023_drop_board_notification_contacts"),
    ]

    operations = [
        migrations.AddField(
            model_name="board",
            name="owner",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name="boards",
                to=settings.AUTH_USER_MODEL,
            ),
        ),
        migrations.AddField(
            model_name="board",
            name="is_inbox",
            field=models.BooleanField(default=False),
        ),
        migrations.AddConstraint(
            model_name="board",
            constraint=models.UniqueConstraint(
                condition=models.Q(("is_inbox", True)),
                fields=("owner",),
                name="unique_inbox_board_per_owner",
            ),
        ),
        migrations.RunPython(create_inboxes_for_existing_users, delete_created_inboxes),
    ]
