from typing import Any
from django import forms
from django.db.models import Value
from django.db.models.functions import Concat
from django.forms import ModelForm, DateTimeInput
import django_filters
from task_manager.labels.models import Label
from task_manager.tasks.models import (
    Checklist,
    ChecklistItem,
    Task,
)
from django.utils.translation import gettext_lazy
from task_manager.users.models import User


class TaskForm(ModelForm[Any]):
    checklist_items = forms.CharField(
        widget=forms.Textarea(
            attrs={
                'placeholder': 'Введите пункты чеклиста, разделяя их новой строкой'
            }
        ),
        required=False,
        label='Пункты чеклиста',
    )

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
        self.request = request
        super().__init__(*args, **kwargs)
        if self.instance.pk and (
            self.instance.state
            or self.instance.author_id != self.request.user.pk
        ):
            for field in self.fields:
                self.fields[field].disabled = True
        self.fields['checklist_items'].widget.attrs['rows'] = 4
        if hasattr(self.instance, 'checklist'):
            checklist_items = self.instance.checklist.items.values_list(
                'description',
                flat=True,
            )

            self.fields['checklist_items'].initial = '\n'.join(checklist_items)

    def save_checklist_items(self, task: Task) -> None:
        items_text = self.cleaned_data.get('checklist_items')
        if items_text:
            checklist, _ = Checklist.objects.get_or_create(task=task)
            existing_items = {
                item.description: item for item in checklist.items.all()
            }
            new_items = set(
                item.strip() for item in items_text.splitlines() if item.strip()
            )
            for description, item in existing_items.items():
                if description not in new_items:
                    item.delete()

            for description in new_items:
                if description not in existing_items:
                    ChecklistItem.objects.create(
                        checklist=checklist, description=description
                    )

    def save(self, commit: bool = True) -> 'Task':
        task = super().save(commit=True)
        self.save_checklist_items(task)
        return task


class TasksFilter(django_filters.FilterSet):

    executors = User.objects.values_list(
        'id', Concat('first_name', Value(' '), 'last_name'), named=True
    ).all()
    executor = django_filters.ChoiceFilter(
        label=gettext_lazy('Исполнитель'), choices=executors
    )

    all_labels = Label.objects.values_list('id', 'name', named=True)
    labels = django_filters.ChoiceFilter(
        label=gettext_lazy('Метка'), choices=all_labels
    )

    self_task = django_filters.BooleanFilter(
        label=gettext_lazy('Только свои задачи'),
        widget=forms.CheckboxInput(),
        method='filter_current_user',
        field_name='self_task',
    )

    def filter_current_user(self, queryset, name, value):
        if value:
            author = getattr(self.request, 'user', None)
            queryset = queryset.filter(author=author)
        return queryset

    class Meta:
        model = Task
        fields = ['executor', 'labels']
