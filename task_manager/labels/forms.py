from django import forms
from django.forms import ModelForm
from task_manager.labels.models import Label
from django.utils.translation import gettext_lazy


class LabelForm(ModelForm[Label]):
    name = forms.CharField(
        max_length=50,
        label=gettext_lazy('Название тега'),
        widget=forms.TextInput(
            attrs={
                'class': 'label-form-input',
                'placeholder': 'Введите название тега',
                'autocomplete': 'off',
                'maxlength': '50',
            }
        ),
        help_text=gettext_lazy('Максимум 50 символов'),
    )

    class Meta:
        model = Label
        fields = ('name',)

    def clean_name(self):
        name = self.cleaned_data.get('name')
        if name:
            # Удаляем лишние пробелы
            name = name.strip()

            # Проверяем на минимальную длину
            if len(name) < 2:
                raise forms.ValidationError(
                    gettext_lazy('Название тега должно содержать минимум 2 символа')
                )

            # Проверяем на максимальную длину
            if len(name) > 50:
                raise forms.ValidationError(
                    gettext_lazy('Название тега не может превышать 50 символов')
                )

            # Проверяем на уникальность (исключая текущий объект при редактировании)
            instance = getattr(self, 'instance', None)
            if instance and instance.pk:
                # Редактирование существующего тега
                if Label.objects.filter(name=name).exclude(pk=instance.pk).exists():
                    raise forms.ValidationError(
                        gettext_lazy('Тег с таким названием уже существует')
                    )
            else:
                # Создание нового тега
                if Label.objects.filter(name=name).exists():
                    raise forms.ValidationError(
                        gettext_lazy('Тег с таким названием уже существует')
                    )

        return name

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)

        # Добавляем CSS классы для стилизации
        for field_name, field in self.fields.items():
            if hasattr(field.widget, 'attrs'):
                field.widget.attrs.update(
                    {
                        'class': 'label-form-input',
                    }
                )
