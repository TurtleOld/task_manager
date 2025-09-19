from django.urls import include, path
from rest_framework.routers import DefaultRouter

from task_manager.users.apis import LoginView, LogoutView, UserProfileView
from task_manager.tasks.apis import TaskViewSet, StageViewSet


router = DefaultRouter(trailing_slash=False)
router.register('tasks', TaskViewSet, basename='task')
router.register('stages', StageViewSet, basename='stage')


app_name = 'api'
urlpatterns = [
    # Аутентификация
    path('auth/login/', LoginView.as_view(), name='login'),
    path('auth/logout/', LogoutView.as_view(), name='logout'),
    path('auth/profile/', UserProfileView.as_view(), name='profile'),
    path('users/', include('task_manager.users.urls')),
    path('', include(router.urls)),
]
