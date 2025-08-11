"""
Django admin configuration for the tasks app.

This module provides admin interface configurations for Task, Stage, and Comment models,
allowing administrators to manage tasks, stages, and comments through the Django admin panel.
"""

from django.contrib import admin

from task_manager.tasks.models import Comment, Stage, Task


@admin.register(Task)
class TaskAdmin(admin.ModelAdmin):
    """
    Admin configuration for the Task model.

    Provides a comprehensive admin interface for managing tasks with list display,
    filtering, search capabilities, and horizontal filter widgets for many-to-many fields.
    """
    list_display = ('name', 'author', 'executor', 'stage', 'state', 'created_at')
    list_filter = ('state', 'stage', 'created_at')
    search_fields = ('name', 'description')
    readonly_fields = ('created_at',)
    filter_horizontal = ('labels', 'reminder_periods')


@admin.register(Stage)
class StageAdmin(admin.ModelAdmin):
    """
    Admin configuration for the Stage model.

    Provides admin interface for managing task stages with list display and
    inline editing capabilities for the order field.
    """
    list_display = ('name', 'order')
    list_editable = ('order',)
    ordering = ('order',)


@admin.register(Comment)
class CommentAdmin(admin.ModelAdmin):
    """
    Admin configuration for the Comment model.

    Provides admin interface for managing task comments with comprehensive
    list display, filtering, search capabilities, and date hierarchy navigation.
    """
    list_display = ('author', 'task', 'created_at', 'is_deleted')
    list_filter = ('is_deleted', 'created_at')
    search_fields = ('content', 'author__username', 'task__name')
    readonly_fields = ('created_at', 'updated_at')
    date_hierarchy = 'created_at'
