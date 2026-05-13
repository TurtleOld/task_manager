from __future__ import annotations

import json
import uuid

import django.db.models.deletion
import django.utils.timezone
from django.conf import settings
from django.db import migrations, models
from django.utils.dateparse import parse_datetime


def migrate_json_attachments(apps, schema_editor):
    Attachment = apps.get_model("kanban", "Attachment")

    attachments_to_create = []
    with schema_editor.connection.cursor() as cursor:
        cursor.execute("SELECT id, attachments FROM kanban_card")
        rows = cursor.fetchall()

    for card_id, raw_attachments in rows:
        if isinstance(raw_attachments, str):
            try:
                attachment_items = json.loads(raw_attachments)
            except json.JSONDecodeError:
                attachment_items = []
        elif isinstance(raw_attachments, list):
            attachment_items = raw_attachments
        else:
            attachment_items = []

        for item in attachment_items:
            if not isinstance(item, dict):
                continue
            attachment_id = item.get("id")
            try:
                attachment_uuid = uuid.UUID(str(attachment_id))
            except (TypeError, ValueError):
                attachment_uuid = uuid.uuid4()

            raw_type = str(item.get("type") or "file")
            attachment_type = raw_type if raw_type in {"file", "link", "photo"} else "file"
            created_at = parse_datetime(str(item.get("createdAt") or ""))
            attachments_to_create.append(
                Attachment(
                    id=attachment_uuid,
                    card_id=card_id,
                    name=str(item.get("name") or "Attachment")[:255],
                    type=attachment_type,
                    url=str(item.get("url") or "")[:2000],
                    path=str(item.get("path") or "")[:1000],
                    mime=str(item.get("mime") or item.get("mimeType") or "")[:255],
                    size=item.get("size") if isinstance(item.get("size"), int) else None,
                    created_at=created_at or django.utils.timezone.now(),
                )
            )

    if attachments_to_create:
        Attachment.objects.bulk_create(attachments_to_create, ignore_conflicts=True)


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ("kanban", "0034_card_query_indexes"),
    ]

    operations = [
        migrations.CreateModel(
            name="Attachment",
            fields=[
                (
                    "id",
                    models.UUIDField(
                        default=uuid.uuid4,
                        editable=False,
                        primary_key=True,
                        serialize=False,
                    ),
                ),
                ("name", models.CharField(max_length=255)),
                (
                    "type",
                    models.CharField(
                        choices=[("file", "File"), ("link", "Link"), ("photo", "Photo")],
                        default="file",
                        max_length=10,
                    ),
                ),
                ("url", models.URLField(blank=True, default="", max_length=2000)),
                ("path", models.CharField(blank=True, default="", max_length=1000)),
                ("mime", models.CharField(blank=True, default="", max_length=255)),
                ("size", models.PositiveBigIntegerField(blank=True, null=True)),
                (
                    "created_at",
                    models.DateTimeField(default=django.utils.timezone.now, editable=False),
                ),
                (
                    "card",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="attachments",
                        to="kanban.card",
                    ),
                ),
                (
                    "uploaded_by",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="uploaded_attachments",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={
                "ordering": ["created_at", "id"],
            },
        ),
        migrations.RunPython(migrate_json_attachments, migrations.RunPython.noop),
        migrations.RemoveField(
            model_name="card",
            name="attachments",
        ),
        migrations.AddIndex(
            model_name="attachment",
            index=models.Index(fields=["card", "created_at"], name="kanban_att_card_id_1b22c6_idx"),
        ),
        migrations.AddIndex(
            model_name="attachment",
            index=models.Index(
                fields=["uploaded_by", "created_at"],
                name="kanban_att_uploade_efecff_idx",
            ),
        ),
        migrations.AddIndex(
            model_name="attachment",
            index=models.Index(fields=["type", "created_at"], name="kanban_att_type_927e81_idx"),
        ),
    ]
