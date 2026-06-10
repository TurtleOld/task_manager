from __future__ import annotations

from django.db import migrations, models


def dedupe_notification_preferences(apps, schema_editor):
    NotificationPreference = apps.get_model("kanban", "NotificationPreference")
    kept_by_key = {}
    for pref in NotificationPreference.objects.order_by("id").iterator():
        key = (pref.user_id, pref.board_id, pref.channel, pref.event_type)
        kept = kept_by_key.get(key)
        if kept is None:
            kept_by_key[key] = pref
            continue
        if pref.enabled and not kept.enabled:
            kept.enabled = True
            kept.save(update_fields=["enabled"])
        pref.delete()


class Migration(migrations.Migration):
    dependencies = [
        ("kanban", "0044_inbox_schedule"),
    ]

    operations = [
        migrations.RunPython(
            dedupe_notification_preferences,
            migrations.RunPython.noop,
        ),
        migrations.AlterUniqueTogether(
            name="notificationpreference",
            unique_together=set(),
        ),
        migrations.AddConstraint(
            model_name="notificationpreference",
            constraint=models.UniqueConstraint(
                condition=models.Q(("board__isnull", False)),
                fields=("user", "board", "channel", "event_type"),
                name="uniq_notification_pref_board",
            ),
        ),
        migrations.AddConstraint(
            model_name="notificationpreference",
            constraint=models.UniqueConstraint(
                condition=models.Q(("board__isnull", True)),
                fields=("user", "channel", "event_type"),
                name="uniq_notification_pref_global",
            ),
        ),
    ]
