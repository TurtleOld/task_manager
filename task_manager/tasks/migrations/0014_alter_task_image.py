# Generated by Django 5.1.2 on 2024-11-04 09:19

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('tasks', '0013_rename_files_task_image'),
    ]

    operations = [
        migrations.AlterField(
            model_name='task',
            name='image',
            field=models.ImageField(
                blank=True, upload_to='images/', verbose_name='Изображение'
            ),
        ),
    ]
