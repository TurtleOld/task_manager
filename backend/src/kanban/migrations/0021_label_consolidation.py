"""Merge Tag and Category into a single Label model.

For each existing Tag and Category we create (or reuse, on name collision) a
Label, copy the M2M relations from Card.tags / Card.categories onto
Card.labels, and finally drop Tag and Category along with the obsolete fields.

A stable hash → palette index assigns a default color per name. Colors can
later be edited via the API. This migration is forward-only for data — the
reverse path restores the schema but cannot reconstruct original tag/category
objects (they were merged on name collision)."""

from __future__ import annotations

import django.utils.timezone
from django.db import migrations, models

PALETTE = [
    "#3b82f6",  # blue
    "#10b981",  # emerald
    "#f59e0b",  # amber
    "#ef4444",  # red
    "#8b5cf6",  # violet
    "#ec4899",  # pink
    "#14b8a6",  # teal
    "#f97316",  # orange
]


def hash_color(name: str) -> str:
    return PALETTE[sum(ord(c) for c in name) % len(PALETTE)]


def merge_tags_and_categories_into_labels(apps, schema_editor):
    Tag = apps.get_model("kanban", "Tag")
    Category = apps.get_model("kanban", "Category")
    Label = apps.get_model("kanban", "Label")

    name_to_label: dict[str, object] = {}

    def upsert_label(name: str):
        existing = name_to_label.get(name)
        if existing is not None:
            return existing
        label, _ = Label.objects.get_or_create(
            name=name,
            defaults={"color": hash_color(name)},
        )
        name_to_label[name] = label
        return label

    for tag in Tag.objects.all():
        label = upsert_label(tag.name)
        for card in tag.cards.all():
            card.labels.add(label)

    for category in Category.objects.all():
        label = upsert_label(category.name)
        for card in category.cards.all():
            card.labels.add(label)


class Migration(migrations.Migration):
    dependencies = [
        ("kanban", "0020_card_priority_int"),
    ]

    operations = [
        migrations.CreateModel(
            name="Label",
            fields=[
                (
                    "id",
                    models.BigAutoField(
                        auto_created=True,
                        primary_key=True,
                        serialize=False,
                        verbose_name="ID",
                    ),
                ),
                (
                    "created_at",
                    models.DateTimeField(default=django.utils.timezone.now, editable=False),
                ),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("version", models.PositiveIntegerField(default=1)),
                ("name", models.CharField(max_length=100, unique=True)),
                ("color", models.CharField(blank=True, default="", max_length=9)),
            ],
            options={
                "ordering": ["name"],
            },
        ),
        migrations.AddField(
            model_name="card",
            name="labels",
            field=models.ManyToManyField(blank=True, related_name="cards", to="kanban.label"),
        ),
        migrations.RunPython(
            merge_tags_and_categories_into_labels,
            reverse_code=migrations.RunPython.noop,
        ),
        migrations.RemoveField(
            model_name="card",
            name="categories",
        ),
        migrations.RemoveField(
            model_name="card",
            name="tags",
        ),
        migrations.DeleteModel(
            name="Category",
        ),
        migrations.DeleteModel(
            name="Tag",
        ),
    ]
