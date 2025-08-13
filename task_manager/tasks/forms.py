"""
Django forms for the tasks app.

This module contains form classes for handling task creation, editing, filtering,
and comment management. It includes forms for tasks, checklist items, task filtering,
and comments with proper validation and widget configurations.
"""

from typing import Any

from django.db.models import Value
from django.db.models.functions import Concat
from django.forms import (
    DateTimeInput,
    Form,
    ModelForm,
    CharField,
    Textarea,
    CheckboxInput,
    TextInput,
)
from django.utils.translation import gettext_lazy
from django_filters import BooleanFilter, ChoiceFilter, FilterSet

from task_manager.labels.models import Label
from task_manager.tasks.models import Checklist, ChecklistItem, Comment, Task
from task_manager.users.models import User


# Constants
MAX_DESCRIPTION_LENGTH = 255
TEXTAREA_ROWS = 4
TEXTAREA_COLS = 10
COMMENT_TEXTAREA_ROWS = 3


class ChecklistItemForm(Form):
    """
    Form for creating and editing checklist items.

    Provides a simple form for adding checklist items to tasks with proper
    styling and accessibility attributes.
    """

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
    """
    Form for creating and editing tasks.

    Provides a comprehensive form for task management including all task fields,
    proper validation, and dynamic field disabling based on task state and user
    permissions.
    """

    class Meta:
        model = Task
        fields = (
            'name',
            'executor',
            'description',
            'reminder_periods',
            'deadline',
            'labels',
            'state',
            'image',
        )
        labels = {
            'name': gettext_lazy('Имя'),
            'executor': gettext_lazy('Исполнитель'),
            'description': gettext_lazy('Описание'),
            'reminder_periods': gettext_lazy('Напоминание до'),
            'labels': gettext_lazy('Метки'),
            'deadline': gettext_lazy('Дата'),
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
        """
        Initialize the form with request context and field validation.

        Args:
            request: The HTTP request object for user context
            *args: Additional positional arguments
            **kwargs: Additional keyword arguments
        """
        self.request = request
        super().__init__(*args, **kwargs)
        self._disable_fields_if_needed()
        self._initialize_checklist_data()

    def save_checklist_items(self, task: Task) -> None:
        """
        Save checklist items associated with the task.

        Creates or updates checklist items based on form data, replacing
        existing items with new ones from the form.

        Args:
            task: The task instance to associate checklist items with
        """
        items_data = self._get_checklist_items_data()
        if not items_data:
            return

        checklist, _ = Checklist.objects.get_or_create(task=task)
        self._replace_checklist_items(checklist, items_data)

    def save(self, commit: bool = True) -> 'Task':
        """
        Save the task and its associated checklist items.

        Args:
            commit: Whether to save the task to the database

        Returns:
            The saved task instance
        """
        task = super().save(commit=True)
        self.save_checklist_items(task)
        return task

    def _get_checklist_items_data(self) -> list:
        """Get checklist items data from cleaned form data."""
        if not hasattr(self, 'cleaned_data'):
            return []

        return self.cleaned_data.get('checklist_items', [])

    def _replace_checklist_items(
        self,
        checklist: Checklist,
        items_data: list,
    ) -> None:
        """Replace existing checklist items with new ones."""
        checklist.items.all().delete()

        for checklist_item_data in items_data:
            self._create_checklist_item(checklist, checklist_item_data)

    def _create_checklist_item(self, checklist: Checklist, item_data: dict) -> None:
        """Create a single checklist item."""
        description = item_data.get('description', '').strip()
        if not description:
            return

        ChecklistItem.objects.create(
            checklist=checklist,
            description=description,
            is_completed=item_data.get('is_completed', False),
        )

    def _disable_fields_if_needed(self) -> None:
        """Disable form fields if task is closed or user is not the author."""
        if not self.instance.pk:
            return

        should_disable = (
            self.instance.state or self.instance.author_id != self.request.user.pk
        )

        if should_disable:
            for field in self.fields:
                self.fields[field].disabled = True

    def _initialize_checklist_data(self) -> None:
        """Initialize checklist data for JavaScript."""
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


class TasksFilter(FilterSet):  # pylint: disable=too-few-public-methods
    """
    Filter form for tasks with filtering options for executor, labels, and
    user-specific tasks.

    Provides filtering capabilities for tasks based on:
    - Executor (user assigned to the task)
    - Labels (tags associated with tasks)
    - Self tasks (tasks created by the current user)
    """

    executors = User.objects.values_list(
        'id', Concat('first_name', Value(' '), 'last_name'), named=True
    ).all()
    executor = ChoiceFilter(label=gettext_lazy('Исполнитель'), choices=executors)

    all_labels = Label.objects.values_list('id', 'name', named=True)
    labels = ChoiceFilter(label=gettext_lazy('Метка'), choices=all_labels)

    self_task = BooleanFilter(
        label=gettext_lazy('Только свои задачи'),
        widget=CheckboxInput(),
        method='filter_current_user',
        field_name='self_task',
    )

    def __init__(self, *args, **kwargs):
        """
        Initialize the TasksFilter with request context.

        Args:
            *args: Additional positional arguments
            **kwargs: Additional keyword arguments including 'request'
        """
        self.request = kwargs.pop('request', None)
        super().__init__(*args, **kwargs)

    def filter_current_user(self, queryset, name, filter_value):
        """
        Filter tasks to show only those created by the current user.

        Args:
            queryset: The queryset to filter
            name: The field name (unused but required by django-filter)
            filter_value: Boolean value indicating whether to filter by current user

        Returns:
            Filtered queryset containing only tasks by the current user if value is
            True, otherwise returns the original queryset unchanged
        """
        if filter_value:
            author = getattr(self.request, 'user', None)
            queryset = queryset.filter(author=author)
        return queryset

    class Meta:
        model = Task
        fields = ['executor', 'labels', 'self_task']


class CommentForm(ModelForm):
    """
    Form for creating and editing comments.

    Provides a simple form for adding comments to tasks with proper styling
    and accessibility attributes.
    """

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
