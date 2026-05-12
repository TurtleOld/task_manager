import django.db.models.deletion
import django.utils.timezone
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("kanban", "0030_card_subtasks"),
    ]

    operations = [
        migrations.CreateModel(
            name="RecurrenceRule",
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
                (
                    "freq",
                    models.CharField(
                        choices=[
                            ("daily", "Daily"),
                            ("weekly", "Weekly"),
                            ("monthly", "Monthly"),
                            ("yearly", "Yearly"),
                        ],
                        max_length=12,
                    ),
                ),
                ("interval", models.PositiveIntegerField(default=1)),
                ("byweekday", models.JSONField(blank=True, default=list)),
                ("byday", models.PositiveIntegerField(blank=True, null=True)),
                ("until", models.DateField(blank=True, null=True)),
                ("count", models.PositiveIntegerField(blank=True, null=True)),
                ("generated_count", models.PositiveIntegerField(default=0)),
                ("next_due", models.DateTimeField(blank=True, null=True)),
                ("last_generated_at", models.DateTimeField(blank=True, null=True)),
                (
                    "card",
                    models.OneToOneField(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="recurrence_rule",
                        to="kanban.card",
                    ),
                ),
            ],
            options={
                "ordering": ["id"],
            },
        ),
        migrations.AddField(
            model_name="card",
            name="parent_recurrence",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="generated_cards",
                to="kanban.recurrencerule",
            ),
        ),
        migrations.AddIndex(
            model_name="recurrencerule",
            index=models.Index(fields=["next_due"], name="kanban_recu_next_du_1d923b_idx"),
        ),
        migrations.AddIndex(
            model_name="recurrencerule",
            index=models.Index(fields=["freq"], name="kanban_recu_freq_4f1229_idx"),
        ),
        migrations.AddIndex(
            model_name="card",
            index=models.Index(
                fields=["parent_recurrence", "created_at"],
                name="kanban_card_parent__f6b36b_idx",
            ),
        ),
    ]
