from django.urls import path
from task_manager.users.views import (
    CreateUser,
    SwitchThemeMode,
    UsersList,
    UpdateUser,
    DeleteUser,
    ProfileUser,
)


app_name = 'users'
urlpatterns = [
    path('', UsersList.as_view(), name='list'),
    path('create/', CreateUser.as_view(), name='create'),
    path('profile/', ProfileUser.as_view(), name='profile'),
    path('<int:pk>/update/', UpdateUser.as_view(), name='update_user'),
    path('<int:pk>/delete/', DeleteUser.as_view(), name='delete_user'),
    path('switch-mode/', SwitchThemeMode.as_view(), name='switch_theme_mode'),
]
