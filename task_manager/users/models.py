"""User models for the task manager application.

This module contains the custom User model that extends Django's AbstractUser
with additional fields for theme preferences and customization.
"""

from typing import Any

from django.contrib.auth.models import AbstractUser
from django.db.models import CharField

THEME_CHOICES = (
    ('dark', 'dark'),
    ('light', 'light'),
)

COLOR_CHOICES = (
    ('red', 'Красный'),
    ('orange', 'Оранжевый'),
    ('yellow', 'Желтый'),
    ('green', 'Зеленый'),
    ('blue', 'Синий'),
    ('indigo', 'Индиго'),
    ('purple', 'Фиолетовый'),
)


class User(AbstractUser):
    """Custom user model with theme preferences.

    Extends Django's AbstractUser to add theme mode and color preferences
    for the user interface customization.
    """

    theme_mode: CharField[Any, Any] = CharField(
        max_length=10,
        default='dark',
        choices=THEME_CHOICES,
    )

    theme_color: CharField[Any, Any] = CharField(
        max_length=10,
        default='blue',
        choices=COLOR_CHOICES,
        verbose_name='Цвет темы',
        help_text='Выберите основной цвет для интерфейса',
    )

    def __str__(self) -> str:
        """Return the user's full name as string representation."""
        return self.get_full_name()
