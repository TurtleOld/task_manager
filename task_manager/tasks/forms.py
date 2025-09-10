from typing import Any

from django.db.models import Value
from django.db.models.functions import Concat
from django.forms import (
    CharField,
    CheckboxInput,
    DateTimeInput,
    Form,
    ModelForm,
    MultipleChoiceField,
    SelectMultiple,
    Textarea,
    TextInput,
)
from django.utils.translation import gettext_lazy
from django_filters import BooleanFilter, ChoiceFilter, FilterSet

from task_manager.labels.models import Label
from task_manager.tasks.models import (
    PERIOD,
    Checklist,
    ChecklistItem,
    Comment,
    Task,
)
from task_manager.users.models import User

MAX_DESCRIPTION_LENGTH = 255
TEXTAREA_ROWS = 4
TEXTAREA_COLS = 10
COMMENT_TEXTAREA_ROWS = 3


class ChecklistItemForm(Form):
    description = CharField(
        max_length=MAX_DESCRIPTION_LENGTH,
        widget=TextInput(
            attrs={
                'class': 'input checklist-item-input',
                'placeholder': 'Введите пункт чеклиста...',
                'aria-label': 'Пункт чеклиста',
            }
        ),
        required=False,
    )


class TaskForm(ModelForm[Any]):
    reminder_periods = MultipleChoiceField(
        choices=PERIOD,
        widget=SelectMultiple(attrs={'class': 'form-control', 'size': '8'}),
        required=False,
        label=gettext_lazy('Напоминание до'),
    )

    class Meta:
        model = Task
        fields = (
            'name',
            'executor',
            'description',
            'deadline',
            'reminder_periods',
            'labels',
            'state',
            'image',
        )
        labels = {
            'name': gettext_lazy('Имя'),
            'executor': gettext_lazy('Исполнитель'),
            'description': gettext_lazy('Описание'),
            'labels': gettext_lazy('Метки'),
            'deadline': gettext_lazy('Дата'),
            'reminder_periods': gettext_lazy('Напоминание до'),
            'state': gettext_lazy('Закрыта?'),
        }
        widgets = {
            'deadline': DateTimeInput(
                attrs={
                    'type': 'datetime-local',
                    'class': 'form-control',
                },
            ),
            'description': Textarea(
                attrs={'rows': TEXTAREA_ROWS, 'cols': TEXTAREA_COLS}
            ),
        }

    def __init__(self, request, *args, **kwargs):
        self.request = request
        super().__init__(*args, **kwargs)
        self._disable_fields_if_needed()
        self._initialize_checklist_data()
        self._initialize_reminder_periods()

    def save_checklist_items(self, task: Task) -> None:
        items_data = self._get_checklist_items_data()
        if not items_data:
            return

        checklist, _ = Checklist.objects.get_or_create(task=task)
        self._replace_checklist_items(checklist, items_data)

    def save(self, *, commit: bool | None = True) -> 'Task':
        task = super().save(commit=False)

        # Save reminder periods
        reminder_periods = self.cleaned_data.get('reminder_periods', [])
        task.set_reminder_periods_list([int(p) for p in reminder_periods])

        if commit:
            task.save()

        self.save_checklist_items(task)
        return task

    def _get_checklist_items_data(self) -> list:
        if not hasattr(self, 'cleaned_data'):
            return []

        return self.cleaned_data.get('checklist_items', [])

    def _replace_checklist_items(
        self,
        checklist: Checklist,
        items_data: list,
    ) -> None:
        checklist.items.all().delete()

        for checklist_item_data in items_data:
            self._create_checklist_item(checklist, checklist_item_data)

    def _create_checklist_item(
        self, checklist: Checklist, item_data: dict
    ) -> None:
        description = item_data.get('description', '').strip()
        if not description:
            return

        ChecklistItem.objects.create(
            checklist=checklist,
            description=description,
            is_completed=item_data.get('is_completed', False),
        )

    def _disable_fields_if_needed(self) -> None:
        if not self.instance.pk:
            return

        should_disable = (
            self.instance.state
            or self.instance.author_id != self.request.user.pk
        )

        if should_disable:
            for field in self.fields:
                self.fields[field].disabled = True

    def _initialize_checklist_data(self) -> None:
        self.checklist_data = []

        if not hasattr(self.instance, 'checklist'):
            return

        checklist_items = self.instance.checklist.items.all()
        self.checklist_data = [
            {
                'id': checklist_item.id,
                'description': checklist_item.description,
                'is_completed': checklist_item.is_completed,
            }
            for checklist_item in checklist_items
        ]

    def _initialize_reminder_periods(self) -> None:
        if self.instance and self.instance.pk:
            current_periods = self.instance.get_reminder_periods_list()
            self.fields['reminder_periods'].initial = current_periods


class TasksFilter(FilterSet):
    executors = User.objects.values_list(
        'id', Concat('first_name', Value(' '), 'last_name'), named=True
    ).all()
    executor = ChoiceFilter(
        label=gettext_lazy('Исполнитель'), choices=executors
    )

    all_labels = Label.objects.values_list('id', 'name', named=True)
    labels = ChoiceFilter(label=gettext_lazy('Метка'), choices=all_labels)

    self_task = BooleanFilter(
        label=gettext_lazy('Только свои задачи'),
        widget=CheckboxInput(),
        method='filter_current_user',
        field_name='self_task',
    )

    def __init__(self, *args, **kwargs):
        self.request = kwargs.pop('request', None)
        super().__init__(*args, **kwargs)

    def filter_current_user(self, queryset, _name, filter_value):
        if filter_value:
            author = getattr(self.request, 'user', None)
            queryset = queryset.filter(author=author)
        return queryset

    class Meta:
        model = Task
        fields = ['executor', 'labels', 'self_task']


class CommentForm(ModelForm):
    class Meta:
        model = Comment
        fields = ['comment_content']
        widgets = {
            'comment_content': Textarea(
                attrs={
                    'class': 'textarea comment-textarea',
                    'placeholder': 'Введите ваш комментарий...',
                    'rows': COMMENT_TEXTAREA_ROWS,
                    'aria-label': 'Текст комментария',
                }
            ),
        }
        labels = {
            'comment_content': gettext_lazy('Комментарий'),
        }
