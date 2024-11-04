# Generated by Django 5.1.2 on 2024-10-31 07:39

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('tasks', '0008_checklist_checklistitem'),
    ]

    operations = [
        migrations.AlterModelOptions(
            name='task',
            options={'ordering': ['-created_at']},
        ),
        migrations.AddField(
            model_name='task',
            name='image',
            field=models.FileField(
                blank=True, upload_to='image', verbose_name='Файл'
            ),
        ),
    ]
