"""
Django forms for the tasks app.

This module contains form classes for handling task creation, editing, filtering,
and comment management. It includes forms for tasks, checklist items, task filtering,
and comments with proper validation and widget configurations.
"""

from typing import Any

from django import forms
from django.db.models import Value
from django.db.models.functions import Concat
from django.forms import DateTimeInput, ModelForm
from django.utils.translation import gettext_lazy
from django_filters import FilterSet, ChoiceFilter, BooleanFilter

from task_manager.labels.models import Label
from task_manager.tasks.models import Checklist, ChecklistItem, Comment, Task
from task_manager.users.models import User


class ChecklistItemForm(forms.Form):
    """
    Form for creating and editing checklist items.

    Provides a simple form for adding checklist items to tasks with proper
    styling and accessibility attributes.
    """
    description = forms.CharField(
        max_length=255,
        widget=forms.TextInput(
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
    proper validation, and dynamic field disabling based on task state and user permissions.
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
            'description': forms.Textarea(attrs={'rows': 4, 'cols': 10}),
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
        if self.instance.pk and (
            self.instance.state or self.instance.author_id != self.request.user.pk
        ):
            for field in self.fields:
                self.fields[field].disabled = True

        # Инициализируем данные чеклиста для JavaScript
        self.checklist_data = []
        if hasattr(self.instance, 'checklist'):
            checklist_items = self.instance.checklist.items.all()
            self.checklist_data = [
                {
                    'id': item.id,
                    'description': item.description,
                    'is_completed': item.is_completed,
                }
                for item in checklist_items
            ]

    def save_checklist_items(self, task: Task) -> None:
        """
        Save checklist items associated with the task.

        Creates or updates checklist items based on form data, replacing
        existing items with new ones from the form.

        Args:
            task: The task instance to associate checklist items with
        """
        if hasattr(self, 'cleaned_data') and 'checklist_items' in self.cleaned_data:
            items_data = self.cleaned_data.get('checklist_items', [])
            if items_data:
                checklist, _ = Checklist.objects.get_or_create(task=task)

                # Удаляем все существующие пункты
                checklist.items.all().delete()

                # Создаем новые пункты
                for item_data in items_data:
                    if item_data.get('description', '').strip():
                        ChecklistItem.objects.create(
                            checklist=checklist,
                            description=item_data['description'].strip(),
                            is_completed=item_data.get('is_completed', False),
                        )

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


class TasksFilter(FilterSet):  # pylint: disable=too-few-public-methods
    """
    Filter form for tasks with filtering options for executor, labels, and user-specific tasks.

    Provides filtering capabilities for tasks based on:
    - Executor (user assigned to the task)
    - Labels (tags associated with tasks)
    - Self tasks (tasks created by the current user)
    """
    executors = User.objects.values_list(
        'id', Concat('first_name', Value(' '), 'last_name'), named=True
    ).all()
    executor = ChoiceFilter(
        label=gettext_lazy('Исполнитель'), choices=executors
    )

    all_labels = Label.objects.values_list('id', 'name', named=True)
    labels = ChoiceFilter(
        label=gettext_lazy('Метка'), choices=all_labels
    )

    self_task = BooleanFilter(
        label=gettext_lazy('Только свои задачи'),
        widget=forms.CheckboxInput(),
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

    def filter_current_user(self, queryset, name, value):
        """
        Filter tasks to show only those created by the current user.

        Args:
            queryset: The queryset to filter
            name: The field name (unused but required by django-filter)
            value: Boolean value indicating whether to filter by current user

        Returns:
            Filtered queryset containing only tasks by the current user if value is True,
            otherwise returns the original queryset unchanged
        """
        if value:
            author = getattr(self.request, 'user', None)
            queryset = queryset.filter(author=author)
        return queryset

    class Meta:
        model = Task
        fields = ['executor', 'labels', 'self_task']


class CommentForm(forms.ModelForm):
    """
    Form for creating and editing comments.

    Provides a simple form for adding comments to tasks with proper styling
    and accessibility attributes.
    """
    class Meta:
        model = Comment
        fields = ['content']
        widgets = {
            'content': forms.Textarea(
                attrs={
                    'class': 'textarea comment-textarea',
                    'placeholder': 'Введите ваш комментарий...',
                    'rows': 3,
                    'aria-label': 'Текст комментария',
                }
            ),
        }
        labels = {
            'content': gettext_lazy('Комментарий'),
        }

    def __init__(self, *args, **kwargs):
        """
        Initialize the comment form.

        Args:
            *args: Additional positional arguments
            **kwargs: Additional keyword arguments
        """
        super().__init__(*args, **kwargs)
