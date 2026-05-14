from __future__ import annotations

from django.db import migrations


def restore_latest_generated_card_recurrence(apps, schema_editor):
    RecurrenceRule = apps.get_model("kanban", "RecurrenceRule")

    source_rules = RecurrenceRule.objects.filter(generated_count__gt=0, next_due__isnull=False)

    for source_rule in source_rules:
        generated_card = (
            source_rule.generated_cards.filter(recurrence_rule__isnull=True)
            .order_by("-created_at", "-id")
            .first()
        )
        if generated_card is None:
            continue

        RecurrenceRule.objects.create(
            card=generated_card,
            freq=source_rule.freq,
            interval=source_rule.interval,
            byweekday=source_rule.byweekday,
            byday=source_rule.byday,
            bysetpos=source_rule.bysetpos,
            until=source_rule.until,
            count=source_rule.count,
            generated_count=source_rule.generated_count,
            last_generated_at=source_rule.last_generated_at,
            next_due=source_rule.next_due,
        )
        source_rule.next_due = None
        source_rule.save(update_fields=["next_due", "updated_at", "version"])


class Migration(migrations.Migration):
    dependencies = [
        ("kanban", "0038_remove_generated_card_recurrences"),
    ]

    operations = [
        migrations.RunPython(restore_latest_generated_card_recurrence, migrations.RunPython.noop),
    ]
