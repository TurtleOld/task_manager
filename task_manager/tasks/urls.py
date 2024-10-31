from django.urls import path

from task_manager.tasks.views import (
    ChecklistItemToggle,
    CloseTask,
    DownloadFileView,
    TasksList,
    CreateTask,
    UpdateTask,
    DeleteTask,
    TaskView,
)

app_name = 'tasks'
urlpatterns = [
    path('', TasksList.as_view(), name='list'),
    path('create/', CreateTask.as_view(), name='create'),
    path('<int:pk>/update/', UpdateTask.as_view(), name='update_task'),
    path('<int:pk>/delete/', DeleteTask.as_view(), name='delete_task'),
    path('<int:pk>/close/', CloseTask.as_view(), name='close_task'),
    path('<int:pk>/', TaskView.as_view(), name='view_task'),
    path('toggle/<int:item_id>/', ChecklistItemToggle.as_view(), name='toggle'),
    path('download/<int:pk>/', DownloadFileView.as_view(), name='download'),
]
