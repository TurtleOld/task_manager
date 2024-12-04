from django.conf import settings
from django.conf.urls.static import static
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
    KanbanBoard,
    UpdateTaskOrderView,
)

app_name = 'tasks'
urlpatterns = [
    path('', TasksList.as_view(), name='list'),
    path('kanban/', KanbanBoard.as_view(), name='kanban'),
    path(
        'kanban/update_order/',
        UpdateTaskOrderView.as_view(),
        name='update_task_order',
    ),
    path('create/', CreateTask.as_view(), name='create'),
    path('<slug:slug>/update/', UpdateTask.as_view(), name='update_task'),
    path('<slug:slug>/delete/', DeleteTask.as_view(), name='delete_task'),
    path('<slug:slug>/close/', CloseTask.as_view(), name='close_task'),
    path('<slug:slug>', TaskView.as_view(), name='view_task'),
    path('toggle/<int:id>/', ChecklistItemToggle.as_view(), name='toggle'),
    path('download/<slug:slug>/', DownloadFileView.as_view(), name='download'),
] + static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
