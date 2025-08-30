"""Admin configuration for the users app.

This module contains Django admin configuration for the User model,
including custom admin interface setup and field organization.
"""

from django.contrib import admin

from task_manager.users.models import User


@admin.register(User)
class UserAdmin(admin.ModelAdmin):
    """Admin interface configuration for the User model.

    Provides a comprehensive admin interface for user management
    with organized fieldsets and useful list displays.
    """

    list_display = (
        'username',
        'email',
        'theme_mode',
        'theme_color',
        'is_staff',
        'is_active',
    )
    list_filter = ('theme_mode', 'theme_color', 'is_staff', 'is_active')
    search_fields = ('username', 'email')
    ordering = ('username',)

    fieldsets = (
        (
            'Основная информация',
            {'fields': ('username', 'email', 'first_name', 'last_name')},
        ),
        (
            'Настройки темы',
            {'fields': ('theme_mode', 'theme_color'), 'classes': ('collapse',)},
        ),
        (
            'Права доступа',
            {
                'fields': (
                    'is_active',
                    'is_staff',
                    'is_superuser',
                    'groups',
                    'user_permissions',
                ),
                'classes': ('collapse',),
            },
        ),
        (
            'Важные даты',
            {'fields': ('last_login', 'date_joined'), 'classes': ('collapse',)},
        ),
    )
