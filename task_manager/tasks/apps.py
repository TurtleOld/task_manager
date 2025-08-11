"""
Django app configuration for the tasks app.

This module contains the app configuration for the tasks application,
defining the app's metadata and default settings.
"""

from django.apps import AppConfig


class TasksConfig(AppConfig):
    """
    Configuration class for the tasks Django app.
    
    Defines the app's name, default auto field, and any app-specific
    configuration settings.
    """
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'task_manager.tasks'
