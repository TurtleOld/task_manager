"""Django admin configuration for the tasks app."""

from django.contrib import admin

from task_manager.tasks.models import (
    Checklist,
    ChecklistItem,
    Comment,
    Stage,
    Task,
)


@admin.register(Task)
class TaskAdmin(admin.ModelAdmin):
    list_display = [
        'name',
        'author',
        'executor',
        'stage',
        'state',
        'created_at',
        'deadline',
    ]
    list_filter = ['state', 'stage', 'created_at', 'deadline']
    search_fields = ['name', 'description']
    readonly_fields = ['created_at', 'updated_at']
    filter_horizontal = ['labels', 'reminder_periods']


@admin.register(Stage)
class StageAdmin(admin.ModelAdmin):
    list_display = ['name', 'order']
    list_editable = ['order']
    ordering = ['order']


@admin.register(Checklist)
class ChecklistAdmin(admin.ModelAdmin):
    list_display = ['task']


@admin.register(ChecklistItem)
class ChecklistItemAdmin(admin.ModelAdmin):
    list_display = ['text', 'checklist', 'is_completed', 'order']
    list_filter = ['is_completed', 'checklist']
    list_editable = ['is_completed', 'order']
    ordering = ['checklist', 'order']


@admin.register(Comment)
class CommentAdmin(admin.ModelAdmin):
    list_display = ['task', 'author', 'created_at', 'is_deleted']
    list_filter = ['is_deleted', 'created_at']
    search_fields = ['content', 'task__name', 'author__username']
    readonly_fields = ['created_at', 'updated_at']
