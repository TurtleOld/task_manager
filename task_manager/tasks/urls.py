from django.conf import settings
from django.conf.urls.static import static
from django.urls import path

from task_manager.tasks.views import (
    ChecklistItemToggle,
    CloseTask,
    DownloadFileView,
    CreateTask,
    UpdateTask,
    DeleteTask,
    TaskView,
    KanbanBoard,
    UpdateTaskOrderView,
    CreateStageView,
    DeleteStageView,
    UpdateStageOrderView,
    UpdateStageView,
)

app_name = 'tasks'
urlpatterns = [
    # path('', TasksList.as_view(), name='list'),
    path('', KanbanBoard.as_view(), name='list'),
    path(
        'kanban/update_order/',
        UpdateTaskOrderView.as_view(),
        name='update_task_order',
    ),
    path(
        'kanban/update_order_stage/',
        UpdateStageOrderView.as_view(),
        name='update_stage_order',
    ),
    path('create/', CreateTask.as_view(), name='create'),
    path('create-stage/', CreateStageView.as_view(), name='create_stage'),
    path('<slug:slug>/update/', UpdateTask.as_view(), name='update_task'),
    path('<slug:slug>/delete/', DeleteTask.as_view(), name='delete_task'),
    path(
        'kanban/<int:pk>/delete/',
        DeleteStageView.as_view(),
        name='delete_stage',
    ),
    path(
        'update-stage/<int:pk>/',
        UpdateStageView.as_view(),
        name='update_stage',
    ),
    path('<slug:slug>/close/', CloseTask.as_view(), name='close_task'),
    path('<slug:slug>', TaskView.as_view(), name='view_task'),
    path('toggle/<int:id>/', ChecklistItemToggle.as_view(), name='toggle'),
    path('download/<slug:slug>/', DownloadFileView.as_view(), name='download'),
] + static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
