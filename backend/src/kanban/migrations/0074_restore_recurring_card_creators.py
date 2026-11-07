from django.db import migrations


def restore_recurring_card_creators(apps, schema_editor):
    Card = apps.get_model("kanban", "Card")
    cards = Card._base_manager.using(schema_editor.connection.alias)
    while rows := list(
        cards.filter(
            created_by__isnull=True,
            parent_recurrence__card__created_by__isnull=False,
        ).values_list("pk", "parent_recurrence__card__created_by_id")[:1000]
    ):
        cards.bulk_update(
            [Card(pk=pk, created_by_id=creator_id) for pk, creator_id in rows],
            ["created_by"],
            batch_size=1000,
        )


class Migration(migrations.Migration):
    dependencies = [
        ("kanban", "0073_notificationdelivery_family_chat_and_more"),
    ]

    operations = [
        migrations.RunPython(restore_recurring_card_creators, migrations.RunPython.noop),
    ]
