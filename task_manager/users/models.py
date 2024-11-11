from django.db.models import CharField
from django.contrib.auth.models import AbstractUser

THEMES = {1: 'dark', 2: 'light'}
class User(AbstractUser):
    theme_mode = CharField(default='dark', choices=THEMES)

    def __str__(self):
        return self.get_full_name()
