"""App configuration for the labels app.

This module contains the Django app configuration for the labels application,
defining app-specific settings and metadata.
"""

from django.apps import AppConfig


class LabelsConfig(AppConfig):
    """Configuration class for the labels Django app."""

    default_auto_field = 'django.db.models.BigAutoField'
    name = 'task_manager.labels'
