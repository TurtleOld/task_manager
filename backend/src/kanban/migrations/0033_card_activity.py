from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion
import django.utils.timezone


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ("kanban", "0032_card_comments"),
    ]

    operations = [
        migrations.CreateModel(
            name="CardActivity",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("action", models.CharField(max_length=50)),
                ("before", models.JSONField(blank=True, default=dict)),
                ("after", models.JSONField(blank=True, default=dict)),
                ("created_at", models.DateTimeField(default=django.utils.timezone.now, editable=False)),
                ("actor", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="card_activities", to=settings.AUTH_USER_MODEL)),
                ("card", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="activities", to="kanban.card")),
            ],
            options={
                "ordering": ["-created_at", "-id"],
            },
        ),
        migrations.AddIndex(
            model_name="cardactivity",
            index=models.Index(fields=["card", "created_at"], name="kanban_card_card_id_9d5a1c_idx"),
        ),
        migrations.AddIndex(
            model_name="cardactivity",
            index=models.Index(fields=["actor", "created_at"], name="kanban_card_actor_i_580296_idx"),
        ),
    ]
