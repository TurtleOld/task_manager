from typing import Any

from django.contrib.auth.models import AnonymousUser
from django.http import HttpRequest


def theme_mode(request: HttpRequest) -> dict[str, Any]:
    if isinstance(request.user, AnonymousUser):
        mode = 'light'
    else:
        mode = request.user.theme_mode

    return {'theme_mode': mode}
