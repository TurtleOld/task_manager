from __future__ import annotations

from django.db import migrations


def backfill_completion_fields(apps, schema_editor):
    Card = apps.get_model("kanban", "Card")
    CardActivity = apps.get_model("kanban", "CardActivity")

    done_cards = Card.objects.filter(column__is_done=True)
    for card in done_cards.iterator():
        move_record = (
            CardActivity.objects.filter(card=card, after__column=card.column_id)
            .order_by("-created_at", "-id")
            .first()
        )
        if move_record is not None:
            card.completed_at = move_record.created_at
            card.completed_by_id = move_record.actor_id
        else:
            card.completed_at = card.updated_at
            card.completed_by_id = None
        card.save(update_fields=["completed_at", "completed_by"])


class Migration(migrations.Migration):

    dependencies = [
        ("kanban", "0048_completion_fields"),
    ]

    operations = [
        migrations.RunPython(backfill_completion_fields, migrations.RunPython.noop),
    ]
