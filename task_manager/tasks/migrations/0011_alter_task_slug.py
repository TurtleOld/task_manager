# Generated by Django 5.1.2 on 2024-11-01 12:15

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('tasks', '0010_task_slug'),
    ]

    operations = [
        migrations.AlterField(
            model_name='task',
            name='slug',
            field=models.SlugField(null=True, unique=True),
        ),
    ]
