"""Django forms for the tasks app."""

import json

from django import forms
from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.utils import timezone
from django.utils.translation import gettext_lazy as _

from task_manager.tasks.models import Checklist, ChecklistItem, Task

User = get_user_model()


class TaskForm(forms.ModelForm):
    checklist_items = forms.CharField(
        required=False,
        widget=forms.HiddenInput(),
        help_text=_('Checklist items in JSON format'),
    )

    class Meta:
        model = Task
        fields = [
            'name',
            'description',
            'executor',
            'labels',
            'stage',
            'order',
            'deadline',
            'reminder_periods',
            'image',
        ]
        widgets = {
            'name': forms.TextInput(attrs={'class': 'input'}),
            'description': forms.Textarea(attrs={'class': 'textarea'}),
            'executor': forms.Select(attrs={'class': 'select'}),
            'labels': forms.SelectMultiple(attrs={'class': 'select'}),
            'stage': forms.Select(attrs={'class': 'select'}),
            'order': forms.NumberInput(attrs={'class': 'input'}),
            'deadline': forms.DateTimeInput(
                attrs={'class': 'input', 'type': 'datetime-local'}
            ),
            'reminder_periods': forms.SelectMultiple(attrs={'class': 'select'}),
            'image': forms.FileInput(attrs={'class': 'file-input'}),
        }

    def __init__(self, *args, **kwargs):
        self.request = kwargs.pop('request', None)
        super().__init__(*args, **kwargs)
        self._setup_form_fields()

    def _setup_form_fields(self):
        if self.request and self.request.user.is_authenticated:
            self.fields['executor'].queryset = User.objects.filter(
                is_active=True
            )
            self.fields['executor'].empty_label = _('Выберите исполнителя')

    def clean_name(self):
        name = self.cleaned_data.get('name')
        if not name:
            raise ValidationError(_('Название задачи обязательно'))
        return name

    def clean_deadline(self):
        deadline = self.cleaned_data.get('deadline')
        if deadline and deadline < timezone.now():
            raise ValidationError(_('Дедлайн не может быть в прошлом'))
        return deadline

    @property
    def checklist_data(self):
        if self.instance.pk and hasattr(self.instance, 'checklist'):
            items = self.instance.checklist.items.all()
            return json.dumps([
                {'text': item.text, 'is_completed': item.is_completed}
                for item in items
            ])
        return '[]'

    def save(self, commit: bool = True) -> 'Task':
        task = super().save(commit=False)
        if commit:
            task.save()
            self._save_checklist(task)
            self.save_m2m()
        return task

    def _save_checklist(self, task):
        checklist_items_data = self.cleaned_data.get('checklist_items')
        if not checklist_items_data:
            return

        try:
            items_data = json.loads(checklist_items_data)
        except (json.JSONDecodeError, TypeError):
            return

        checklist, _ = Checklist.objects.get_or_create(task=task)
        self._replace_checklist_items(checklist, items_data)

    def _replace_checklist_items(self, checklist, items_data):
        checklist.items.all().delete()
        for i, item_data in enumerate(items_data):
            if isinstance(item_data, dict) and 'text' in item_data:
                ChecklistItem.objects.create(
                    checklist=checklist,
                    text=item_data['text'],
                    is_completed=item_data.get('is_completed', False),
                    order=i,
                )


class ChecklistItemForm(forms.ModelForm):
    class Meta:
        model = ChecklistItem
        fields = ['text', 'is_completed']
        widgets = {
            'text': forms.TextInput(attrs={'class': 'input'}),
            'is_completed': forms.CheckboxInput(attrs={'class': 'checkbox'}),
        }


class CommentForm(forms.ModelForm):
    class Meta:
        model = 'tasks.Comment'
        fields = ['content']
        widgets = {
            'content': forms.Textarea(attrs={'class': 'textarea', 'rows': 3}),
        }

    def clean_content(self):
        content = self.cleaned_data.get('content')
        if not content or not content.strip():
            raise ValidationError(_('Содержание комментария обязательно'))
        return content.strip()


class TasksFilter(forms.Form):
    executor = forms.ModelChoiceField(
        queryset=User.objects.filter(is_active=True),
        required=False,
        empty_label=_('Все исполнители'),
        widget=forms.Select(attrs={'class': 'select'}),
    )
    labels = forms.ModelMultipleChoiceField(
        queryset='labels.Label'.objects.all(),
        required=False,
        widget=forms.SelectMultiple(attrs={'class': 'select'}),
    )
    self_tasks = forms.BooleanField(
        required=False,
        initial=False,
        widget=forms.CheckboxInput(attrs={'class': 'checkbox'}),
        label=_('Только мои задачи'),
    )

    def __init__(self, *args, **kwargs):
        self.user = kwargs.pop('user', None)
        super().__init__(*args, **kwargs)
        if self.user:
            self.fields['executor'].queryset = User.objects.filter(
                is_active=True
            )

    def filter_queryset(self, queryset):
        if self.is_valid():
            executor = self.cleaned_data.get('executor')
            labels = self.cleaned_data.get('labels')
            self_tasks = self.cleaned_data.get('self_tasks')

            if executor:
                queryset = queryset.filter(executor=executor)
            if labels:
                queryset = queryset.filter(labels__in=labels).distinct()
            if self_tasks and self.user:
                queryset = queryset.filter(author=self.user)

        return queryset
