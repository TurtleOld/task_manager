from django.db.models import CharField
from django.contrib.auth.models import AbstractUser


class User(AbstractUser):
    theme_mode = CharField(
        max_length=10,
        default='dark',
    )

    def __str__(self):
        return self.get_full_name()
