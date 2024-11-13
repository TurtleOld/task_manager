from django.db.models import CharField
from django.contrib.auth.models import AbstractUser

THEME_CHOICES = [
    ('dark', 'dark'),
    ('light', 'light'),
]


class User(AbstractUser):
    theme_mode = CharField(
        max_length=10,
        default='dark',
        choices=THEME_CHOICES,
    )

    def __str__(self):
        return self.get_full_name()
