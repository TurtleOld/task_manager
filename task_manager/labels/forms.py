from django import forms
from django.utils.translation import gettext_lazy

from task_manager.labels.models import Label

MIN_LABEL_LENGTH = 2
MAX_LABEL_LENGTH = 50


class LabelForm(forms.ModelForm):
    name = forms.CharField(
        max_length=MAX_LABEL_LENGTH,
        label=gettext_lazy('Название тега'),
        widget=forms.TextInput(
            attrs={
                'class': 'label-form-input',
                'placeholder': 'Введите название тега',
                'autocomplete': 'off',
                'maxlength': str(MAX_LABEL_LENGTH),
            }
        ),
        help_text=gettext_lazy(f'Максимум {MAX_LABEL_LENGTH} символов'),
    )

    class Meta:
        model = Label
        fields = ('name',)

    def __init__(self, *args, **kwargs):
        """Initialize the form with custom styling."""
        super().__init__(*args, **kwargs)
        for field in self.fields.values():
            if hasattr(field.widget, 'attrs'):
                field.widget.attrs.update({
                    'class': 'label-form-input',
                })

    def clean_name(self):
        name = self.cleaned_data.get('name')
        if not name:
            return name

        name = name.strip()

        if len(name) < MIN_LABEL_LENGTH:
            raise forms.ValidationError(
                gettext_lazy(
                    f'Название тега должно содержать минимум '
                    f'{MIN_LABEL_LENGTH} символа'
                )
            )

        if len(name) > MAX_LABEL_LENGTH:
            raise forms.ValidationError(
                gettext_lazy(
                    f'Название тега не может превышать '
                    f'{MAX_LABEL_LENGTH} символов'
                )
            )

        self._check_name_uniqueness(name)

        return name

    def _check_name_uniqueness(self, name):
        """Check if label name is unique."""
        instance = getattr(self, 'instance', None)
        queryset = Label.objects.filter(name=name)

        if instance and instance.pk:
            queryset = queryset.exclude(pk=instance.pk)

        if queryset.exists():
            raise forms.ValidationError(
                gettext_lazy('Тег с таким названием уже существует')
            )
