from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("kanban", "0002_column_icon"),
    ]

    operations = [
        migrations.AddField(
            model_name="card",
            name="deadline",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="card",
            name="estimate",
            field=models.CharField(blank=True, default="", max_length=100),
        ),
    ]
