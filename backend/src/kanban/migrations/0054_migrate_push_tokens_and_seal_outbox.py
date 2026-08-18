"""Carry existing state into the new dispatcher world.

Two jobs, both mandatory before the dispatcher is ever started:

1. Seal the outbox. `NotificationEvent.dispatch_status` defaults to PENDING and
   `next_attempt_at` to now, so every historical event — hundreds of them —
   would look like unsent work on the dispatcher's first pass and be delivered
   at once. They were already handled by Celery. Mark them DONE.

2. Move `NotificationProfile.fcm_token` into a `PushDevice` row, so the Android
   app that people already have installed keeps receiving notifications
   through the new multi-device path.
"""

from __future__ import annotations

from django.db import migrations


def seal_existing_events(apps, _schema_editor):
    NotificationEvent = apps.get_model("kanban", "NotificationEvent")
    # Everything that exists at migration time predates the outbox and was
    # already dispatched (or permanently missed) by the Celery pipeline.
    NotificationEvent.objects.update(dispatch_status="done")


def unseal_existing_events(apps, _schema_editor):
    NotificationEvent = apps.get_model("kanban", "NotificationEvent")
    NotificationEvent.objects.update(dispatch_status="pending")


def migrate_fcm_tokens(apps, _schema_editor):
    NotificationProfile = apps.get_model("kanban", "NotificationProfile")
    PushDevice = apps.get_model("kanban", "PushDevice")

    for profile in NotificationProfile.objects.exclude(fcm_token="").iterator():
        token = (profile.fcm_token or "").strip()
        if not token:
            continue
        PushDevice.objects.get_or_create(
            kind="fcm",
            token=token,
            defaults={
                "user_id": profile.user_id,
                "label": "Android (перенесено из профиля)",
                "active": True,
            },
        )


def unmigrate_fcm_tokens(apps, _schema_editor):
    PushDevice = apps.get_model("kanban", "PushDevice")
    PushDevice.objects.filter(kind="fcm").delete()


class Migration(migrations.Migration):
    dependencies = [
        ("kanban", "0053_notification_dispatcher_and_push_devices"),
    ]

    operations = [
        migrations.RunPython(seal_existing_events, unseal_existing_events),
        migrations.RunPython(migrate_fcm_tokens, unmigrate_fcm_tokens),
    ]
