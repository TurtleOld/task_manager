# Generated by Django 5.1.3 on 2024-12-05 09:16

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('tasks', '0017_stage_alter_task_options_task_order_task_stage'),
    ]

    operations = [
        migrations.AlterModelOptions(
            name='stage',
            options={'ordering': ['order']},
        ),
        migrations.AddField(
            model_name='stage',
            name='order',
            field=models.PositiveIntegerField(default=0),
        ),
    ]
