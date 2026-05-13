import django.db.models.deletion
import django.utils.timezone
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ("kanban", "0031_recurrence_rules"),
    ]

    operations = [
        migrations.CreateModel(
            name="CardComment",
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
                ("text", models.TextField()),
                (
                    "created_at",
                    models.DateTimeField(default=django.utils.timezone.now, editable=False),
                ),
                ("edited_at", models.DateTimeField(blank=True, null=True)),
                (
                    "author",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="card_comments",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
                (
                    "card",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="comments",
                        to="kanban.card",
                    ),
                ),
            ],
            options={
                "ordering": ["created_at", "id"],
            },
        ),
        migrations.AddIndex(
            model_name="cardcomment",
            index=models.Index(
                fields=["card", "created_at"],
                name="kanban_card_card_id_ebbc6c_idx",
            ),
        ),
        migrations.AddIndex(
            model_name="cardcomment",
            index=models.Index(
                fields=["author", "created_at"],
                name="kanban_card_author__4d3d4e_idx",
            ),
        ),
    ]
