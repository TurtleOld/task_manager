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
    path('<slug:slug>/update/', UpdateTask.as_view(), name='update_task'),
    path('<slug:slug>/delete/', DeleteTask.as_view(), name='delete_task'),
    path('<slug:slug>/close/', CloseTask.as_view(), name='close_task'),
    path('<slug:slug>', TaskView.as_view(), name='view_task'),
    path('toggle/<slug:slug>/', ChecklistItemToggle.as_view(), name='toggle'),
    path('download/<slug:slug>/', DownloadFileView.as_view(), name='download'),
]
