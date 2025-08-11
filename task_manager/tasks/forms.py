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
        task = super().save(commit=True)
        self.save_checklist_items(task)
        return task


class TasksFilter(FilterSet):
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

    def filter_current_user(self, queryset, name, value):
        if value:
            author = getattr(self.request, 'user', None)
            queryset = queryset.filter(author=author)
        return queryset

    class Meta:
        model = Task
        fields = ['executor', 'labels']


class CommentForm(forms.ModelForm):
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
        super().__init__(*args, **kwargs)
