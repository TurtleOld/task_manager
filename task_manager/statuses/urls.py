from django.urls import path

from task_manager.statuses.views import (
    StatusesList,
    CreateStatus,
    UpdateStatus,
    DeleteStatus,
)

app_name = 'statuses'
urlpatterns = [
    path('', StatusesList.as_view(), name='list'),
    path('create/', CreateStatus.as_view(), name='create'),
    path('<int:pk>/update/', UpdateStatus.as_view(), name='update_status'),
    path('<int:pk>/delete/', DeleteStatus.as_view(), name='delete_status'),
]
