"""Label forms for the task manager application.

This module contains Django forms for label creation and editing,
including validation for label names and uniqueness checks.
"""

from django import forms
from django.utils.translation import gettext_lazy

from task_manager.labels.models import Label

# Constants
MIN_LABEL_LENGTH = 2
MAX_LABEL_LENGTH = 50


class LabelForm(forms.ModelForm):
    """Form for creating and editing labels.

    Provides validation for label names including length constraints,
    uniqueness checks, and proper formatting.
    """

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
        """Meta class for form configuration."""

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
        """Clean and validate the label name field.

        Returns:
            The cleaned label name.

        Raises:
            forms.ValidationError: If the name doesn't meet validation
            requirements.
        """
        name = self.cleaned_data.get('name')
        if not name:
            return name

        # Remove extra whitespace
        name = name.strip()

        # Check minimum length
        if len(name) < MIN_LABEL_LENGTH:
            raise forms.ValidationError(
                gettext_lazy(
                    f'Название тега должно содержать минимум '
                    f'{MIN_LABEL_LENGTH} символа'
                )
            )

        # Check maximum length
        if len(name) > MAX_LABEL_LENGTH:
            raise forms.ValidationError(
                gettext_lazy(
                    f'Название тега не может превышать '
                    f'{MAX_LABEL_LENGTH} символов'
                )
            )

        # Check uniqueness
        self._check_name_uniqueness(name)

        return name

    def _check_name_uniqueness(self, name):
        """Check if label name is unique.

        Args:
            name: The label name to check for uniqueness.

        Raises:
            forms.ValidationError: If a label with the same name already exists.
        """
        instance = getattr(self, 'instance', None)
        queryset = Label.objects.filter(name=name)

        if instance and instance.pk:
            queryset = queryset.exclude(pk=instance.pk)

        if queryset.exists():
            raise forms.ValidationError(
                gettext_lazy('Тег с таким названием уже существует')
            )
