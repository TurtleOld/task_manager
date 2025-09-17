import json
import pathlib

from django.conf import settings
from django.db import models
from django.db.models.signals import post_migrate
from django.dispatch import receiver
from django.urls import reverse
from django.utils.timezone import now
from django.utils.translation import gettext_lazy as _

from task_manager.labels.models import Label
from task_manager.users.models import User

PERIOD = (
    (10, '10 минут'),
    (20, '20 минут'),
    (30, '30 минут'),
    (40, '40 минут'),
    (50, '50 минут'),
    (60, '1 час'),
    (120, '2 часа'),
    (180, '3 часа'),
    (240, '4 часа'),
    (300, '5 часов'),
    (360, '6 часов'),
    (420, '7 часов'),
    (480, '8 часов'),
    (540, '9 часов'),
    (600, '10 часов'),
    (660, '11 часов'),
    (720, '12 часов'),
    (780, '13 часов'),
    (840, '14 часов'),
    (900, '15 часов'),
    (960, '16 часов'),
    (1020, '17 часов'),
    (1080, '18 часов'),
    (1140, '19 часов'),
    (1200, '20 часов'),
    (1260, '21 час'),
    (1320, '22 часа'),
    (1380, '23 часа'),
    (1440, '24 часа'),
)

STAGES = (
    ('to_do', _('Запланировано')),
    ('in_progress', _('В процессе')),
    ('review', _('На проверке')),
    ('done', _('Выполнено')),
)

PERIOD_DICT = dict(PERIOD)
MAX_NAME_LENGTH = 50
MAX_DESCRIPTION_LENGTH = 255
MAX_STAGE_NAME_LENGTH = 100
DEFAULT_REMINDER_PERIOD = 60


class Checklist(models.Model):
    task = models.OneToOneField(
        'Task',
        on_delete=models.CASCADE,
        related_name='checklist',
    )
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self) -> str:
        task_name = self.task.name
        return f'Чеклист для задачи: {task_name}'


class ChecklistItem(models.Model):
    checklist = models.ForeignKey(
        Checklist,
        on_delete=models.CASCADE,
        related_name='items',
    )
    description = models.CharField(max_length=MAX_DESCRIPTION_LENGTH)
    is_completed = models.BooleanField(default=False)

    def __str__(self) -> str:
        return self.description


class Stage(models.Model):
    name = models.CharField(
        max_length=MAX_STAGE_NAME_LENGTH,
        choices=STAGES,
        null=True,
        blank=True,
        unique=True,
        default='to_do',
    )
    order = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ['order']

    @classmethod
    def create_stages(cls) -> None:
        if Stage.objects.count() == 0:
            for index, stage in enumerate(STAGES):
                Stage.objects.create(name=stage[0], order=index + 1)

    def __str__(self) -> str:
        return self.name


@receiver(post_migrate)
def create_default_stages(sender, **kwargs):
    if sender.name == 'tasks':
        Stage.create_stages()


class Task(models.Model):
    name = models.CharField(max_length=MAX_NAME_LENGTH)
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
    reminder_periods = models.CharField(
        max_length=255,
        blank=True,
        null=True,
        help_text='Comma-separated list of reminder period values',
    )
    sent_notifications = models.TextField(
        blank=True,
        null=True,
        help_text='JSON field to track sent notification periods',
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
        if not self.reminder_periods:
            return ''

        period_values = self.get_reminder_periods_list()
        period_dict = dict(PERIOD)

        return ', '.join(
            period_dict.get(int(period), f'{period} минут')
            for period in period_values
        )

    def get_reminder_periods_list(self) -> list[str]:
        if not self.reminder_periods:
            return []
        return [
            p.strip() for p in self.reminder_periods.split(',') if p.strip()
        ]

    def set_reminder_periods_list(self, periods: list[int]) -> None:
        if periods:
            self.reminder_periods = ','.join(str(p) for p in periods)
        else:
            self.reminder_periods = ''

    def is_notification_sent(self, period_minutes: int) -> bool:
        if not self.sent_notifications:
            return False

        try:
            sent_periods = json.loads(self.sent_notifications)
            return str(period_minutes) in sent_periods
        except (json.JSONDecodeError, TypeError):
            return False

    def mark_notification_sent(self, period_minutes: int) -> None:
        try:
            if self.sent_notifications:
                sent_periods = json.loads(self.sent_notifications)
            else:
                sent_periods = []

            if str(period_minutes) not in sent_periods:
                sent_periods.append(str(period_minutes))
                self.sent_notifications = json.dumps(sent_periods)
                self.save(update_fields=['sent_notifications'])
        except (json.JSONDecodeError, TypeError):
            self.sent_notifications = json.dumps([str(period_minutes)])
            self.save(update_fields=['sent_notifications'])

    def get_absolute_url(self) -> str:
        return reverse('tasks:view_task', args=[self.slug])

    def move_to_stage(self, new_stage_id: int) -> None:
        old_stage = self.stage
        new_stage = Stage.objects.get(id=new_stage_id)
        self.stage = new_stage

        self.save()

        if old_stage:
            reorder_tasks_in_stage(old_stage)
        reorder_tasks_in_stage(new_stage)

    def reorder_within_stage(self, new_order: int) -> None:
        reorder_task_within_stage(self, new_order)

    def save(self, *args, **kwargs) -> None:
        image_dir = settings.MEDIA_ROOT / 'images'
        if not pathlib.Path(image_dir).exists():
            pathlib.Path(image_dir).mkdir(parents=True, exist_ok=True)
        super().save(*args, **kwargs)


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
    comment_content = models.TextField(verbose_name=_('Содержание комментария'))
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
        author_name = str(self.author)
        task_name = self.task.name
        return f'Комментарий от {author_name} к задаче {task_name}'

    def can_edit(self, user: User) -> bool:
        return user == self.author and not self.is_deleted

    def can_delete(self, user: User) -> bool:
        return user == self.author and not self.is_deleted

    def soft_delete(self) -> None:
        self.__class__.objects.filter(id=self.pk).update(is_deleted=True)
        self.refresh_from_db()


def reorder_tasks_in_stage(stage: 'Stage') -> None:
    tasks = Task.objects.filter(stage_id=stage.id).order_by(
        'order', 'created_at'
    )
    for index, task in enumerate(tasks):
        task.order = index
        task.save(update_fields=['order'])


def reorder_task_within_stage(task: Task, new_order: int) -> None:
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

    for index, task_item in enumerate(reordered_tasks):
        task_item.order = index
        task_item.save(update_fields=['order'])

