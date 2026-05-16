from __future__ import annotations

from django.db import migrations


def deactivate_source_rules_with_recurring_children(apps, schema_editor):
    RecurrenceRule = apps.get_model("kanban", "RecurrenceRule")

    for source_rule in RecurrenceRule.objects.filter(next_due__isnull=False):
        has_recurring_child = source_rule.generated_cards.filter(
            recurrence_rule__isnull=False,
        ).exists()
        if not has_recurring_child:
            continue
        source_rule.next_due = None
        source_rule.save(update_fields=["next_due", "updated_at", "version"])


class Migration(migrations.Migration):
    dependencies = [
        ("kanban", "0039_restore_latest_generated_card_recurrence"),
    ]

    operations = [
        migrations.RunPython(
            deactivate_source_rules_with_recurring_children,
            migrations.RunPython.noop,
        ),
    ]
