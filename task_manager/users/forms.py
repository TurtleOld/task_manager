"""User forms for the task manager application.

This module contains Django forms for user authentication and registration,
including custom forms that extend Django's built-in authentication forms.
"""

from typing import ClassVar

from django.contrib.auth.forms import AuthenticationForm, UserCreationForm
from django.forms import CharField, PasswordInput

from task_manager.users.models import User


class RegisterUserForm(UserCreationForm[User]):
    """Form for user registration.

    Extends Django's UserCreationForm to handle user registration
    with custom fields and validation.
    """

    class Meta:
        """Meta class for form configuration."""

        model = User
        fields: ClassVar[list[str]] = [
            'first_name',
            'last_name',
            'username',
            'password1',
            'password2',
        ]


class AuthUserForm(AuthenticationForm):
    """Form for user authentication.

    Extends Django's AuthenticationForm with custom field labels
    and styling for the Russian language interface.
    """

    username = CharField(
        label='Имя пользователя',
    )
    password = CharField(
        label='Пароль',
        strip=False,
        widget=PasswordInput,
    )
