from django.urls import include, path

from task_manager.users.apis import LoginView, LogoutView, UserProfileView


app_name = 'api'
urlpatterns = [
    # Аутентификация
    path('auth/login/', LoginView.as_view(), name='login'),
    path('auth/logout/', LogoutView.as_view(), name='logout'),
    path('auth/profile/', UserProfileView.as_view(), name='profile'),

    # Включаем URL-ы из других приложений
    path('users/', include('task_manager.users.urls')),
]