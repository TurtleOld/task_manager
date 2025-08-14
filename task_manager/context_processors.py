from typing import Any

from django.contrib.auth.models import AnonymousUser
from django.http import HttpRequest

from task_manager.users.models import User


def theme_mode(request: HttpRequest) -> dict[str, Any]:
    if isinstance(request.user, AnonymousUser):
        mode = 'light'
    else:
        mode = request.user.theme_mode

    return {'theme_mode': mode}


def registration_available(request: HttpRequest) -> dict[str, Any]:
    """Проверяет, доступна ли регистрация (только если нет пользователей в БД)"""
    return {'registration_available': not User.objects.exists()}
