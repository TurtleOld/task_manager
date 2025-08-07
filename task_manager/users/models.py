from typing import Any

from django.db.models import CharField
from django.contrib.auth.models import AbstractUser

THEME_CHOICES = [
    ('dark', 'dark'),
    ('light', 'light'),
]

COLOR_CHOICES = [
    ('red', 'Красный'),
    ('orange', 'Оранжевый'),
    ('yellow', 'Желтый'),
    ('green', 'Зеленый'),
    ('blue', 'Синий'),
    ('indigo', 'Индиго'),
    ('purple', 'Фиолетовый'),
]


class User(AbstractUser):
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
        return self.get_full_name()
