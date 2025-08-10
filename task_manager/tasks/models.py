import os
from django.conf import settings
from django.db import models
from django.urls import reverse
from django.utils.timezone import now

from task_manager.labels.models import Label
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
        'Task',
        on_delete=models.CASCADE,
        related_name='checklist',
    )
    created_at = models.DateTimeField(auto_now_add=True)

    def str(self) -> str:
        return f'Чеклист для задачи: {self.task.name}'


class ChecklistItem(models.Model):
    checklist = models.ForeignKey(
        Checklist,
        on_delete=models.CASCADE,
        related_name='items',
    )
    description = models.CharField(max_length=255)
    is_completed = models.BooleanField(default=False)

    def str(self) -> str:
        return self.description


class ReminderPeriod(models.Model):
    period = models.IntegerField(
        default=60,
        blank=True,
        null=True,
        choices=[(key, value) for key, value in PERIOD.items()],
    )

    def __str__(self) -> str:
        if isinstance(self.period, int):
            return str(PERIOD.get(self.period, 60))
        return 'Не задано'


class Stage(models.Model):
    name = models.CharField(
        max_length=100,
        null=True,
        blank=True,
        unique=True,
        default='Process',
    )
    order = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ['order']


class Task(models.Model):
    name = models.CharField(max_length=50)
    description = models.TextField(blank=True)

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
        null=True,
    )
    slug = models.SlugField(null=True, unique=True)
    reminder_periods = models.ManyToManyField(
        ReminderPeriod,
        related_name='tasks',
        blank=True,
    )
    labels = models.ManyToManyField(Label, related_name='tasks', blank=True)
    stage = models.ForeignKey(
        Stage,
        related_name='tasks',
        on_delete=models.CASCADE,
        null=True,
    )
    order = models.PositiveSmallIntegerField(default=0)

    class Meta:
        indexes = [
            models.Index(fields=['stage', 'order']),
            models.Index(fields=['created_at']),
        ]

    def __str__(self) -> str:
        return self.name

    def is_deadline_overdue(self) -> bool:
        if self.deadline:
            return self.deadline.astimezone() < now().astimezone()
        return False

    def get_reminder_period_display(self) -> str:
        return ', '.join(str(period) for period in self.reminder_periods.all())

    def get_absolute_url(self) -> str:
        return reverse('tasks:view_task', args=[self.slug])

    def move_to_stage(self, new_stage_id):
        old_stage_id = self.stage.id
        self.stage.id = new_stage_id

        self.save()

        if old_stage_id:
            reorder_tasks_in_stage(old_stage_id)
        reorder_tasks_in_stage(new_stage_id)

    def reorder_within_stage(self, new_order):
        """
        Reorders the task within its current stage.
        """
        reorder_task_within_stage(self, new_order)

    def save(self, *args, **kwargs):
        image_dir = os.path.join(settings.MEDIA_ROOT, 'images')
        if not os.path.exists(image_dir):
            os.makedirs(image_dir)
        super().save(*args, **kwargs)


class Comment(models.Model):
    """Модель для комментариев к задачам."""

    task = models.ForeignKey(
        Task,
        on_delete=models.CASCADE,
        related_name='comments',
        verbose_name=_('Задача'),
    )
    author = models.ForeignKey(
        User, on_delete=models.CASCADE, related_name='comments', verbose_name=_('Автор')
    )
    content = models.TextField(verbose_name=_('Содержание комментария'))
    created_at = models.DateTimeField(
        auto_now_add=True, verbose_name=_('Дата создания')
    )
    updated_at = models.DateTimeField(
        null=True, blank=True, verbose_name=_('Дата обновления')
    )
    is_deleted = models.BooleanField(default=False, verbose_name=_('Удалён'))

    class Meta:
        ordering = ['-created_at']
        verbose_name = _('Комментарий')
        verbose_name_plural = _('Комментарии')

    def __str__(self) -> str:
        return f'Комментарий от {self.author} к задаче {self.task.name}'

    def can_edit(self, user: User) -> bool:
        """Проверяет, может ли пользователь редактировать комментарий."""
        return user == self.author and not self.is_deleted

    def can_delete(self, user: User) -> bool:
        """Проверяет, может ли пользователь удалить комментарий."""
        return user == self.author and not self.is_deleted

    def soft_delete(self) -> None:
        """Мягкое удаление комментария."""
        self.is_deleted = True
        self.save(update_fields=['is_deleted'])


def reorder_tasks_in_stage(stage_id):
    tasks = Task.objects.filter(stage_id=stage_id).order_by('order', 'created_at')
    for index, task in enumerate(tasks):
        task.order = index
        task.save(update_fields=['order'])


def reorder_task_within_stage(task, new_order):
    stage_id = task.stage_id
    if not stage_id:
        return

    tasks = (
        Task.objects.filter(stage_id=stage_id)
        .exclude(id=task.id)
        .order_by('order', 'created_at')
    )
    reordered_tasks = list(tasks)
    reordered_tasks.insert(new_order, task)

    for index, t in enumerate(reordered_tasks):
        t.order = index
        t.save(update_fields=['order'])
