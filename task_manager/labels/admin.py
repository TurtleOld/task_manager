"""Admin configuration for the labels app.

This module contains Django admin configuration for the Label model,
providing basic admin interface for label management.
"""

from django.contrib import admin

from task_manager.labels.models import Label

admin.site.register(Label)
