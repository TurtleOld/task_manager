from django.urls import path

from task_manager.users.views import (
    CreateUser,
    DeleteUser,
    LogoutUser,
    ProfileUser,
    SwitchThemeMode,
    UpdateThemeColor,
    UpdateUser,
)

app_name = 'users'
urlpatterns = [
    path('create/', CreateUser.as_view(), name='create'),
    path('profile/', ProfileUser.as_view(), name='profile'),
    path('<int:pk>/update/', UpdateUser.as_view(), name='update_user'),
    path('<int:pk>/delete/', DeleteUser.as_view(), name='delete_user'),
    path('switch-mode/', SwitchThemeMode.as_view(), name='switch_theme_mode'),
    path(
        'update-theme-color/',
        UpdateThemeColor.as_view(),
        name='update_theme_color',
    ),
    path('logout/', LogoutUser.as_view(), name='logout'),
]
