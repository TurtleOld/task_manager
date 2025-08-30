"""URL configuration for the tasks app."""

from django.conf import settings
from django.conf.urls.static import static
from django.urls import path

from task_manager.tasks.views import (
    ChecklistItemToggle,
    CloseTask,
    CommentCreateView,
    CommentDeleteView,
    CommentEditFormView,
    CommentUpdateView,
    CommentViewView,
    CreateStageView,
    CreateTask,
    DeleteTask,
    DownloadFileView,
    KanbanBoard,
    TaskView,
    UpdateTask,
    UpdateTaskOrderView,
    UpdateTaskStageView,
    checklist_progress_view,
    comments_list_view,
)

app_name = 'tasks'

base_urlpatterns = [
    path('', KanbanBoard.as_view(), name='list'),
    path(
        'create/',
        CreateTask.as_view(),
        name='create',
    ),
    path(
        'create-stage/',
        CreateStageView.as_view(),
        name='create_stage',
    ),
    path(
        '<slug:slug>/',
        TaskView.as_view(),
        name='view_task',
    ),
    path(
        '<slug:slug>/update/',
        UpdateTask.as_view(),
        name='update_task',
    ),
    path(
        '<slug:slug>/delete/',
        DeleteTask.as_view(),
        name='delete_task',
    ),
    path(
        '<slug:slug>/close/',
        CloseTask.as_view(),
        name='close_task',
    ),
    path(
        '<slug:slug>/download/',
        DownloadFileView.as_view(),
        name='download_file',
    ),
    path(
        '<slug:slug>/comments/',
        comments_list_view,
        name='comments_list',
    ),
    path(
        '<slug:slug>/comments/create/',
        CommentCreateView.as_view(),
        name='comment_create',
    ),
    path(
        'comments/<int:comment_id>/update/',
        CommentUpdateView.as_view(),
        name='comment_update',
    ),
    path(
        'comments/<int:comment_id>/delete/',
        CommentDeleteView.as_view(),
        name='comment_delete',
    ),
    path(
        'comments/<int:comment_id>/edit-form/',
        CommentEditFormView.as_view(),
        name='comment_edit_form',
    ),
    path(
        'comments/<int:comment_id>/view/',
        CommentViewView.as_view(),
        name='comment_view',
    ),
    path(
        'checklist/<int:pk>/toggle/',
        ChecklistItemToggle.as_view(),
        name='toggle_checklist_item',
    ),
    path(
        'checklist-progress/<int:task_id>/',
        checklist_progress_view,
        name='checklist_progress',
    ),
    path(
        'update-stage/',
        UpdateTaskStageView.as_view(),
        name='update_task_stage',
    ),
    path(
        'update-order/',
        UpdateTaskOrderView.as_view(),
        name='update_task_order',
    ),
]

static_urlpatterns = static(
    settings.MEDIA_URL, document_root=settings.MEDIA_ROOT
)

urlpatterns = [*base_urlpatterns, *static_urlpatterns]
