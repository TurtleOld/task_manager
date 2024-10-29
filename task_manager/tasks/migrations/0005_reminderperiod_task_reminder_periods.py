from django.db import migrations, models

PERIOD = {
    10: '10 минут',
    20: '20 минут',
    30: '30 минут',
    40: '40 минут',
    50: '50 минут',
    60: '1 час',
    120: '2 часа',
    180: '3 часа',
    240: '4 часа',
    300: '5 часов',
    360: '6 часов',
    420: '7 часов',
    480: '8 часов',
    540: '9 часов',
    600: '10 часов',
    660: '11 часов',
    720: '12 часов',
    780: '13 часов',
    840: '14 часов',
    900: '15 часов',
    960: '16 часов',
    1020: '17 часов',
    1080: '18 часов',
    1140: '19 часов',
    1200: '20 часов',
    1260: '21 час',
    1320: '22 часа',
    1380: '23 часа',
    1440: '24 часа',
}


def create_reminder_periods(apps, schema_editor):
    ReminderPeriod = apps.get_model('tasks', 'ReminderPeriod')
    for key, _ in PERIOD.items():
        ReminderPeriod.objects.create(period=key)


class Migration(migrations.Migration):

    dependencies = [
        ('tasks', '0004_reminderperiod_task_reminder_periods'),
    ]

    operations = [
        migrations.RunPython(create_reminder_periods),
    ]
