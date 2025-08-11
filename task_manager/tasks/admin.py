from django.contrib import admin

from task_manager.tasks.models import Comment, Stage, Task


@admin.register(Task)
class TaskAdmin(admin.ModelAdmin):
    list_display = ('name', 'author', 'executor', 'stage', 'state', 'created_at')
    list_filter = ('state', 'stage', 'created_at')
    search_fields = ('name', 'description')
    readonly_fields = ('created_at',)
    filter_horizontal = ('labels', 'reminder_periods')


@admin.register(Stage)
class StageAdmin(admin.ModelAdmin):
    list_display = ('name', 'order')
    list_editable = ('order',)
    ordering = ('order',)


@admin.register(Comment)
class CommentAdmin(admin.ModelAdmin):
    list_display = ('author', 'task', 'created_at', 'is_deleted')
    list_filter = ('is_deleted', 'created_at')
    search_fields = ('content', 'author__username', 'task__name')
    readonly_fields = ('created_at', 'updated_at')
    date_hierarchy = 'created_at'
