"""Context processors for the task manager application.

This module provides context processors that add variables to the template
context for all templates in the application.
"""

from typing import Any

from django.contrib.auth.models import AnonymousUser
from django.http import HttpRequest

from task_manager.users.models import User


def theme_mode(request: HttpRequest) -> dict[str, Any]:
    """Return the user's theme mode preference.

    Args:
        request: The HTTP request object.

    Returns:
        A dictionary containing the theme mode ('light' or 'dark').
    """
    if isinstance(request.user, AnonymousUser):
        mode = 'light'
    else:
        mode = request.user.theme_mode

    return {'theme_mode': mode}


def registration_available(request: HttpRequest) -> dict[str, Any]:
    """Check if user registration is available.

    Registration is only available if there are no users in the database.

    Args:
        request: The HTTP request object.

    Returns:
        A dictionary indicating whether registration is available.
    """
    return {'registration_available': not User.objects.exists()}
