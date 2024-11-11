from urllib.parse import urljoin
from django.conf import settings
from django.db import models
from django.urls import reverse
from django.utils.timezone import now

from task_manager.labels.models import Label
from task_manager.statuses.models import Status
from task_manager.users.models import User
from django.utils.translation import gettext_lazy as _

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


class Checklist(models.Model):
    task = models.OneToOneField(
        'Task', on_delete=models.CASCADE, related_name='checklist'
    )
    created_at = models.DateTimeField(auto_now_add=True)

    def str(self):
        return f'Чеклист для задачи: {self.task.name}'


class ChecklistItem(models.Model):
    checklist = models.ForeignKey(
        Checklist,
        on_delete=models.CASCADE,
        related_name='items',
    )
    description = models.CharField(max_length=255)
    is_completed = models.BooleanField(default=False)

    def str(self):
        return self.description


class ReminderPeriod(models.Model):
    period = models.IntegerField(
        blank=True,
        null=True,
        choices=[(key, value) for key, value in PERIOD.items()],
    )

    def __str__(self):
        return PERIOD[self.period]


class Task(models.Model):
    name = models.CharField(max_length=50)
    description = models.TextField()

    status = models.ForeignKey(
        Status,
        on_delete=models.PROTECT,
        null=True,
        related_name='tasks',
    )
    author = models.ForeignKey(
        User,
        on_delete=models.PROTECT,
        null=False,
        related_name='tasks',
    )
    executor = models.ForeignKey(
        User,
        null=True,
        on_delete=models.PROTECT,
        related_name='works',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    deadline = models.DateTimeField(blank=True, null=True)
    state = models.BooleanField(default=False)
    image = models.ImageField(
        _('Изображение'),
        upload_to='images',
        blank=True,
    )
    slug = models.SlugField(null=True, unique=True)
    reminder_periods = models.ManyToManyField(
        ReminderPeriod,
        related_name='tasks',
        blank=True,
    )
    labels = models.ManyToManyField(Label, related_name='tasks', blank=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return self.name

    def is_deadline_overdue(self):
        if self.deadline:
            return self.deadline.astimezone() < now().astimezone()
        return False

    @property
    def image_url(self):
        if self.image:
            return urljoin(f'/tasks{settings.MEDIA_URL}', self.image.name)

    def get_reminder_period_display(self):
        return ', '.join(str(period) for period in self.reminder_periods.all())

    def get_absolute_url(self):
        return reverse("tasks:view_task", args=[self.slug])
