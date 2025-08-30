"""Task management models for the Django application."""

import pathlib

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.db import models
from django.urls import reverse
from django.utils import timezone
from django.utils.translation import gettext_lazy as _
from transliterate import slugify

from task_manager.constants import DEFAULT_REMINDER_PERIOD

User = get_user_model()

PERIOD_DICT = {
    0: 'За час',
    1: 'За день',
    2: 'За неделю',
    3: 'За месяц',
}


class ReminderPeriod(models.Model):
    name = models.CharField(max_length=50, verbose_name=_('Название'))
    period = models.IntegerField(verbose_name=_('Период в часах'))

    class Meta:
        verbose_name = _('Период напоминания')
        verbose_name_plural = _('Периоды напоминания')

    def __str__(self) -> str:
        if isinstance(self.period, int):
            return str(PERIOD_DICT.get(self.period, DEFAULT_REMINDER_PERIOD))
        return 'Не задано'


class Stage(models.Model):
    name = models.CharField(max_length=100, verbose_name=_('Название'))
    order = models.IntegerField(default=0, verbose_name=_('Порядок'))

    class Meta:
        ordering = ['order']

    def __str__(self) -> str:
        return self.name


class Task(models.Model):
    name = models.CharField(max_length=200, verbose_name=_('Название'))
    description = models.TextField(blank=True, verbose_name=_('Описание'))
    author = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name='created_tasks',
        verbose_name=_('Автор'),
    )
    executor = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name='assigned_tasks',
        blank=True,
        null=True,
        verbose_name=_('Исполнитель'),
    )
    stage = models.ForeignKey(
        Stage,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        verbose_name=_('Этап'),
    )
    order = models.IntegerField(default=0, verbose_name=_('Порядок'))
    state = models.BooleanField(default=False, verbose_name=_('Статус'))
    created_at = models.DateTimeField(
        auto_now_add=True, verbose_name=_('Дата создания')
    )
    updated_at = models.DateTimeField(
        auto_now=True, verbose_name=_('Дата обновления')
    )
    deadline = models.DateTimeField(
        blank=True, null=True, verbose_name=_('Дедлайн')
    )
    labels = models.ManyToManyField(
        'labels.Label',
        blank=True,
        related_name='tasks',
        verbose_name=_('Метки'),
    )
    reminder_periods = models.ManyToManyField(
        ReminderPeriod,
        blank=True,
        verbose_name=_('Периоды напоминания'),
    )
    image = models.ImageField(
        upload_to='images/',
        blank=True,
        null=True,
        verbose_name=_('Изображение'),
    )
    slug = models.SlugField(max_length=200, unique=True, blank=True)

    class Meta:
        indexes = [
            models.Index(fields=['stage', 'order']),
            models.Index(fields=['created_at']),
        ]

    def __str__(self) -> str:
        return self.name

    def save(self, *args, **kwargs) -> None:
        if not self.slug:
            self.slug = slugify(self.name)
        if self.image:
            image_dir = pathlib.Path(settings.MEDIA_ROOT) / 'images'
            if not image_dir.exists():
                image_dir.mkdir(parents=True)
        super().save(*args, **kwargs)

    def get_absolute_url(self) -> str:
        return reverse('tasks:view_task', kwargs={'slug': self.slug})

    def clean(self) -> None:
        if self.deadline and self.deadline < self.created_at:
            raise ValidationError(
                _('Дедлайн не может быть раньше даты создания')
            )

    @property
    def is_overdue(self) -> bool:
        if not self.deadline:
            return False
        return timezone.now() > self.deadline

    @property
    def progress_percentage(self) -> int:
        if not hasattr(self, 'checklist') or not self.checklist:
            return 0
        total_items = self.checklist.items.count()
        if total_items == 0:
            return 0
        completed_items = self.checklist.items.filter(is_completed=True).count()
        return int((completed_items / total_items) * 100)


class Checklist(models.Model):
    task = models.OneToOneField(
        Task,
        on_delete=models.CASCADE,
        related_name='checklist',
        verbose_name=_('Задача'),
    )
    created_at = models.DateTimeField(
        auto_now_add=True, verbose_name=_('Дата создания')
    )

    def __str__(self) -> str:
        return f'Чек-лист для задачи: {self.task.name}'


class ChecklistItem(models.Model):
    checklist = models.ForeignKey(
        Checklist,
        on_delete=models.CASCADE,
        related_name='items',
        verbose_name=_('Чек-лист'),
    )
    text = models.CharField(max_length=200, verbose_name=_('Текст'))
    is_completed = models.BooleanField(
        default=False, verbose_name=_('Выполнено')
    )
    order = models.IntegerField(default=0, verbose_name=_('Порядок'))

    class Meta:
        ordering = ['order']

    def __str__(self) -> str:
        return self.text


class Comment(models.Model):
    task = models.ForeignKey(
        Task,
        on_delete=models.CASCADE,
        related_name='comments',
        verbose_name=_('Задача'),
    )
    author = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name='comments',
        verbose_name=_('Автор'),
    )
    content = models.TextField(verbose_name=_('Содержание'))
    created_at = models.DateTimeField(
        auto_now_add=True, verbose_name=_('Дата создания')
    )
    updated_at = models.DateTimeField(
        auto_now=True, verbose_name=_('Дата обновления')
    )
    is_deleted = models.BooleanField(default=False, verbose_name=_('Удалено'))

    class Meta:
        ordering = ['-created_at']
        verbose_name = _('Комментарий')
        verbose_name_plural = _('Комментарии')

    def __str__(self) -> str:
        return (
            f'Комментарий от {self.author.username} к задаче {self.task.name}'
        )

    def can_edit(self, user) -> bool:
        return user == self.author and not self.is_deleted

    def can_delete(self, user) -> bool:
        return user == self.author and not self.is_deleted

    def soft_delete(self) -> None:
        self.is_deleted = True
        self.save(update_fields=['is_deleted'])


def reorder_task_within_stage(task: Task, new_order: int) -> None:
    if task.stage:
        stage_tasks = Task.objects.filter(stage=task.stage).exclude(pk=task.pk)
        new_order = min(stage_tasks.count(), new_order)
        stage_tasks = list(stage_tasks)
        stage_tasks.insert(new_order, task)
        for i, t in enumerate(stage_tasks):
            t.order = i
            t.save(update_fields=['order'])
