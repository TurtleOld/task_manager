"""App configuration for the users app.

This module contains the Django app configuration for the users application,
defining app-specific settings and metadata.
"""

from django.apps import AppConfig


class UsersConfig(AppConfig):
    """Configuration class for the users Django app."""

    default_auto_field = 'django.db.models.BigAutoField'
    name = 'task_manager.users'
