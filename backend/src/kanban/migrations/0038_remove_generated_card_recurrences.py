from __future__ import annotations

from django.db import migrations


def remove_generated_card_recurrence_rules(apps, schema_editor):
    RecurrenceRule = apps.get_model("kanban", "RecurrenceRule")
    RecurrenceRule.objects.filter(card__parent_recurrence__isnull=False).delete()


class Migration(migrations.Migration):
    dependencies = [
        ("kanban", "0037_add_recurrencerule_bysetpos"),
    ]

    operations = [
        migrations.RunPython(remove_generated_card_recurrence_rules, migrations.RunPython.noop),
    ]
