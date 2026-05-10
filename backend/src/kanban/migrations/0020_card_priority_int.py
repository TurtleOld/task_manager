from __future__ import annotations

from django.db import migrations, models


EMOJI_TO_INT = {
    "🔥": "3",  # HIGH
    "🟡": "2",  # NORMAL
    "🟢": "1",  # LOW
    "": "0",  # NONE
}

INT_TO_EMOJI = {
    "3": "🔥",
    "2": "🟡",
    "1": "🟢",
    "0": "",
}


def emoji_to_int(apps, schema_editor):
    Card = apps.get_model("kanban", "Card")
    for emoji, value in EMOJI_TO_INT.items():
        Card.objects.filter(priority=emoji).update(priority=value)
    # Anything else (unexpected legacy values) falls back to NORMAL.
    Card.objects.exclude(priority__in=["0", "1", "2", "3"]).update(priority="2")


def int_to_emoji(apps, schema_editor):
    Card = apps.get_model("kanban", "Card")
    for value, emoji in INT_TO_EMOJI.items():
        Card.objects.filter(priority=value).update(priority=emoji)


class Migration(migrations.Migration):
    dependencies = [
        ("kanban", "0019_notificationprofile_timezone_configured"),
    ]

    operations = [
        migrations.RunPython(emoji_to_int, reverse_code=int_to_emoji),
        migrations.AlterField(
            model_name="card",
            name="priority",
            field=models.IntegerField(
                choices=[
                    (0, "Без приоритета"),
                    (1, "Можно позже"),
                    (2, "Важно"),
                    (3, "Срочно"),
                ],
                default=2,
            ),
        ),
    ]
