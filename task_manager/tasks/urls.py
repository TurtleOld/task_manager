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
    UpdateTask,
    checklist_progress_view,
    CommentCreateView,
    CommentUpdateView,
    CommentDeleteView,
    CommentEditFormView,
    CommentViewView,
    comments_list_view,
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
    path('update/<slug:slug>', UpdateTask.as_view(), name='update'),
    path('create-stage/', CreateStageView.as_view(), name='create_stage'),
    path(
        'delete/<slug:slug>/',
        DeleteTask.as_view(),
        name='delete_task',
    ),
    path('<slug:slug>/close/', CloseTask.as_view(), name='close_task'),
    path('<slug:slug>', TaskView.as_view(), name='view_task'),
    path('toggle/<int:pk>/', ChecklistItemToggle.as_view(), name='toggle'),
    path('download/<slug:slug>/', DownloadFileView.as_view(), name='download'),
    path(
        'checklist_progress/<int:task_id>/',
        checklist_progress_view,
        name='checklist_progress',
    ),
    # Комментарии
    path(
        '<slug:task_slug>/comments/',
        comments_list_view,
        name='comments_list',
    ),
    path(
        '<slug:task_slug>/comment/create/',
        CommentCreateView.as_view(),
        name='comment_create',
    ),
    path(
        'comment/<int:comment_id>/update/',
        CommentUpdateView.as_view(),
        name='comment_update',
    ),
    path(
        'comment/<int:comment_id>/delete/',
        CommentDeleteView.as_view(),
        name='comment_delete',
    ),
    path(
        'comment/<int:comment_id>/edit-form/',
        CommentEditFormView.as_view(),
        name='comment_edit_form',
    ),
    path(
        'comment/<int:comment_id>/view/',
        CommentViewView.as_view(),
        name='comment_view',
    ),
] + static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
