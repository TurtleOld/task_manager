# Generated by Django 5.1.3 on 2024-11-08 10:57

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('tasks', '0012_alter_task_image'),
    ]

    operations = [
        migrations.AlterField(
            model_name='task',
            name='image',
            field=models.ImageField(
                blank=True, upload_to='images', verbose_name='Изображение'
            ),
        ),
    ]