# Generated by Django 4.0.4 on 2022-05-15 20:32

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('labels', '0001_initial'),
    ]

    operations = [
        migrations.AlterField(
            model_name='label',
            name='name',
            field=models.CharField(max_length=50),
        ),
    ]
