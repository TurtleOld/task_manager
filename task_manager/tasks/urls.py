from django.conf import settings
from django.conf.urls.static import static
from django.urls import path

from task_manager.tasks.views import (
    ChecklistItemToggle,
    CloseTask,
    DownloadFileView,
    CreateTask,
    DeleteTask,
    TaskView,
    KanbanBoard,
    UpdateTaskOrderView,
    CreateStageView,
    UpdateTaskStageView,
)

app_name = 'tasks'
urlpatterns = [
    path('', KanbanBoard.as_view(), name='list'),
    path(
        'kanban/update_order/',
        UpdateTaskOrderView.as_view(),
        name='update_task_order',
    ),
    path(
        'update-task-stage/',
        UpdateTaskStageView.as_view(),
        name='update_task_stage',
    ),
    path('create/', CreateTask.as_view(), name='create'),
    path('create-stage/', CreateStageView.as_view(), name='create_stage'),
    path(
        'delete/<int:pk>/',
        DeleteTask.as_view(),
        name='delete_task',
    ),
    path('<slug:slug>/close/', CloseTask.as_view(), name='close_task'),
    path('<slug:slug>', TaskView.as_view(), name='view_task'),
    path('toggle/<int:id>/', ChecklistItemToggle.as_view(), name='toggle'),
    path('download/<slug:slug>/', DownloadFileView.as_view(), name='download'),
] + static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
