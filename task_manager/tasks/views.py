"""
Django views for the tasks app.

This module contains all view classes and functions for the task management system,
including task CRUD operations, kanban board views, comment management, and file handling.
"""

import json
import mimetypes
import pathlib
from typing import Any
from urllib.parse import quote

from django.contrib import messages
from django.contrib.auth.mixins import LoginRequiredMixin, UserPassesTestMixin
from django.contrib.messages.views import SuccessMessageMixin
from django.db import IntegrityError
from django.forms import BaseForm, ModelForm
from django.http import (
    FileResponse,
    Http404,
    HttpRequest,
    HttpResponse,
    JsonResponse,
)
from django.shortcuts import get_object_or_404, redirect, render
from django.template.loader import render_to_string
from django.urls import reverse_lazy
from django.utils.translation import gettext_lazy as _
from django.views import View
from django.views.generic import (
    CreateView,
    DeleteView,
    DetailView,
    UpdateView,
)
from django_filters.views import FilterView

from task_manager.constants import HTTP_BAD_REQUEST, HTTP_FORBIDDEN, HTTP_OK
from task_manager.tasks.forms import CommentForm, TaskForm, TasksFilter
from task_manager.tasks.models import (
    Comment,
    Stage,
    Task,
)
from task_manager.tasks.services import (
    close_or_reopen_task,
    create_comment,
    create_task_with_checklist,
    delete_comment,
    delete_task_with_notification,
    get_checklist_progress,
    get_comments_for_task,
    get_kanban_data,
    get_task_context_data,
    process_bulk_task_updates,
    process_checklist_items,
    send_task_creation_notifications,
    toggle_checklist_item,
    update_comment,
    update_task_stage_and_order,
)


class TasksList(
    LoginRequiredMixin,
    SuccessMessageMixin[Any],
    FilterView,
):
    """
    View for displaying a filtered list of tasks.

    Provides a filterable list view of tasks with authentication requirements
    and success message handling.
    """

    model = Task
    template_name = 'tasks/kanban.html'
    context_object_name = 'tasks'
    filterset_class = TasksFilter
    error_message = _(
        'У вас нет прав на просмотр данной страницы! Авторизуйтесь!'
    )
    no_permission_url = reverse_lazy('login')


class KanbanBoard(
    LoginRequiredMixin,
    SuccessMessageMixin[Any],
    FilterView,
):
    """
    Kanban board view for task management.

    Displays tasks organized by stages in a kanban board format,
    with filtering capabilities and JSON data for JavaScript interactions.
    """

    template_name = 'tasks/kanban.html'

    def get(self, request, *args, **kwargs):
        """
        Handle GET requests for the kanban board.

        Returns:
            Rendered kanban board with task data and stage information
        """
        context = get_kanban_data(request)
        return render(request, 'tasks/kanban.html', context)


class CreateStageView(LoginRequiredMixin, SuccessMessageMixin, CreateView):
    """
    View for creating new task stages.

    Provides a form for creating new stages in the task workflow.
    """

    model = Stage
    template_name = 'tasks/create_stage.html'
    fields = '__all__'
    success_url = reverse_lazy('tasks:list')


class UpdateTaskStageView(View):
    """
    AJAX view for updating task stages and positions.

    Handles drag-and-drop operations for moving tasks between stages
    and reordering tasks within stages.
    """

    def post(self, request, *args, **kwargs) -> JsonResponse:
        """
        Handle POST requests for updating task stages and positions.

        Returns:
            JSON response indicating success or failure
        """
        try:
            return self._process_task_update_request(request)
        except Exception as error:
            return JsonResponse({'success': False, 'error': str(error)})

    def _process_task_update_request(self, request) -> JsonResponse:
        """Process task update request."""
        request_data = json.loads(request.body)
        task_id = request_data.get('task_id')
        new_stage_id = request_data.get('new_stage_id')
        new_order = request_data.get('new_order')

        if not self._is_valid_update_request(task_id, new_stage_id, new_order):
            return JsonResponse({'success': False, 'error': 'Invalid data'})

        update_result = update_task_stage_and_order(
            task_id, new_stage_id, new_order, request
        )
        return JsonResponse(update_result)

    def _is_valid_update_request(
        self, task_id, new_stage_id, new_order
    ) -> bool:
        """Check if update request is valid."""
        if not task_id:
            return False
        return new_stage_id is not None or new_order is not None


class UpdateTaskOrderView(View):
    """
    AJAX view for updating task order in bulk.

    Handles bulk updates of task positions and stages from the kanban board.
    """

    def post(self, request) -> JsonResponse:
        """
        Handle POST requests for bulk task order updates.

        Returns:
            JSON response indicating success or failure
        """
        try:
            request_data = json.loads(request.body)
            tasks_data = request_data.get('tasks', [])

            if not tasks_data:
                return JsonResponse(
                    {'error': 'No tasks data provided'}, status=HTTP_BAD_REQUEST
                )

            process_bulk_task_updates(tasks_data, request)
            return JsonResponse(
                {'message': 'Tasks successfully updated'}, status=HTTP_OK
            )
        except Exception as error:
            return JsonResponse({'error': str(error)}, status=HTTP_BAD_REQUEST)


class CreateTask(
    LoginRequiredMixin,
    SuccessMessageMixin[Any],
    CreateView[Task, Any],
):
    """
    View for creating new tasks.

    Provides a form for creating new tasks with checklist support,
    notification scheduling, and proper validation.
    """

    model = Task
    template_name = 'tasks/create_task.html'
    form_class = TaskForm
    success_message = _('Задача успешно создана')
    success_url = reverse_lazy('tasks:list')
    error_message = _(
        'У вас нет прав на просмотр данной страницы! Авторизуйтесь!'
    )
    no_permission_url = reverse_lazy('login')
    query_pk_and_slug = True

    def get_form_kwargs(self) -> dict[str, Any]:
        """
        Get form keyword arguments including the request object.

        Returns:
            Dictionary of form keyword arguments
        """
        kwargs = super().get_form_kwargs()
        kwargs['request'] = self.request
        return kwargs

    def form_valid(self, form: TaskForm) -> HttpResponse:
        """
        Handle valid form submission for task creation.

        Args:
            form: The validated task form

        Returns:
            HTTP response after successful task creation
        """
        try:
            task, task_slug = create_task_with_checklist(form, self.request)
            send_task_creation_notifications(
                task.name, task_slug, form, self.request
            )
            return super().form_valid(form)
        except IntegrityError:
            messages.error(
                self.request,
                'Задача с таким названием уже существует.',
            )
            return self.form_invalid(form)


class UpdateTask(
    LoginRequiredMixin,
    SuccessMessageMixin[Any],
    UpdateView[Task, Any],
):
    """
    View for updating existing tasks.

    Provides a form for editing tasks with checklist support and proper validation.
    """

    template_name = 'tasks/update_task.html'
    query_pk_and_slug = True
    form_class = TaskForm
    model = Task
    context_object_name = 'tasks'

    def get_form_kwargs(self) -> dict[str, Any]:
        """
        Get form keyword arguments including the request object.

        Returns:
            Dictionary of form keyword arguments
        """
        kwargs = super().get_form_kwargs()
        kwargs['request'] = self.request
        return kwargs

    def get_context_data(self, **kwargs: dict[str, Any]) -> dict[str, Any]:
        """
        Get context data including checklist information.

        Args:
            **kwargs: Additional context data

        Returns:
            Dictionary of context data
        """
        context = super().get_context_data(**kwargs)
        form = context['form']
        context['checklist_data'] = json.dumps(form.checklist_data)
        return context

    def form_valid(self, form: TaskForm) -> HttpResponse:
        """
        Handle valid form submission for task updates.

        Args:
            form: The validated task form

        Returns:
            HTTP response after successful task update
        """
        checklist_items = process_checklist_items(self.request)
        form.cleaned_data = form.cleaned_data or {}
        form.cleaned_data['checklist_items'] = checklist_items

        return super().form_valid(form)


class DeleteTask(
    LoginRequiredMixin,
    SuccessMessageMixin,
    UserPassesTestMixin,
    DeleteView,
):
    """
    View for deleting tasks.

    Provides task deletion functionality with permission checks
    and notification sending.
    """

    template_name = 'tasks/task_confirm_delete.html'
    model = Task
    success_url = reverse_lazy('tasks:list')
    success_message = 'Задача успешно удалена'
    context_object_name = 'tasks'

    def test_func(self):
        """
        Test if the user can delete the task.

        Returns:
            True if the user is the task author, False otherwise
        """
        task = self.get_object()
        return self.request.user == task.author

    def handle_no_permission(self):
        """
        Handle cases where the user doesn't have permission to delete the task.

        Returns:
            Redirect response with error message
        """
        messages.error(
            self.request,
            'Вы не можете удалить чужую задачу!',
        )
        return redirect('tasks:list')

    def delete(self, request, *args, **kwargs) -> HttpResponse:
        """
        Handle task deletion with notification.

        Returns:
            Redirect response after successful deletion
        """
        task = self.get_object()
        delete_task_with_notification(task)

        messages.success(request, self.success_message)
        return redirect('tasks:list')

    def form_invalid(self, form: ModelForm[Task]) -> HttpResponse:
        """
        Handle invalid form submission.

        Args:
            form: The invalid form

        Returns:
            Redirect response with error message
        """
        messages.error(
            self.request,
            _('Вы не можете удалить чужую задачу!'),
        )
        return redirect('tasks:list')


class CloseTask(View):
    """
    View for closing and reopening tasks.

    Handles task state changes with permission checks and notifications.
    """

    model = Task
    template_name = 'tasks/kanban.html'
    form_class = TaskForm
    slug_field = 'slug'
    slug_url_kwarg = 'slug'

    def post(self, request: HttpRequest, slug: str) -> HttpResponse:
        """
        Handle POST requests for closing/reopening tasks.

        Args:
            request: The HTTP request
            slug: The task slug

        Returns:
            Redirect response after state change
        """
        success, message = close_or_reopen_task(slug, request)

        if success:
            messages.success(request, message)
        else:
            messages.error(request, message)

        return redirect('tasks:list')


class TaskView(
    LoginRequiredMixin,
    SuccessMessageMixin[BaseForm],
    DetailView[Task],
):
    """
    View for displaying task details.

    Shows comprehensive task information including comments, checklist progress,
    and related data with pagination support.
    """

    model = Task
    template_name = 'tasks/view_task.html'
    context_object_name = 'task'
    error_message = _(
        'У вас нет прав на просмотр данной страницы! Авторизуйтесь!'
    )
    no_permission_url = reverse_lazy('login')
    query_pk_and_slug = True

    def get_context_data(self, **kwargs: dict[str, Any]) -> dict[str, Any]:
        """
        Get context data including comments, checklist, and labels.

        Args:
            **kwargs: Additional context data

        Returns:
            Dictionary of context data
        """
        context = super().get_context_data(**kwargs)
        task = self.get_object()
        context.update(get_task_context_data(task, self.request))
        context['comment_form'] = CommentForm()
        return context


class ChecklistItemToggle(View):
    """
    AJAX view for toggling checklist item completion status.

    Handles checkbox toggles for checklist items with real-time updates.
    """

    template_name = 'tasks/checklist_item.html'

    def post(self, request: HttpRequest, pk: int) -> HttpResponse:
        """
        Handle POST requests for toggling checklist items.

        Args:
            request: The HTTP request
            pk: The checklist item primary key

        Returns:
            Rendered checklist item template
        """
        checklist_item = toggle_checklist_item(pk)
        context = {'item': checklist_item}
        return render(request, self.template_name, context)


class DownloadFileView(DetailView[Task]):
    """
    View for downloading task images.

    Provides secure file download functionality for task images
    with proper MIME type detection and filename handling.
    """

    model = Task

    def get(self, request: HttpRequest, *args, **kwargs) -> FileResponse:
        """
        Handle GET requests for file downloads.

        Args:
            request: The HTTP request
            *args: Additional arguments
            **kwargs: Additional keyword arguments

        Returns:
            FileResponse for the task image

        Raises:
            Http404: If the file is not found
        """
        task = self.get_object()
        image_path = task.image.path
        image_name = task.image.name
        mime_type, _ = mimetypes.guess_type(image_name)
        if not mime_type:
            mime_type = 'application/octet-stream'
        try:
            with open(image_path, 'rb') as file_handle:
                response = FileResponse(
                    file_handle,
                    content_type=mime_type,
                )
                quote_filename = quote(pathlib.Path(image_name).name)
                response['Content-Disposition'] = (
                    f"attachment; filename*=UTF-8''{quote_filename}"
                )
                return response
        except FileNotFoundError:
            raise Http404('Файл не найден')


def checklist_progress_view(request, task_id):
    """
    AJAX view for getting checklist progress.

    Returns HTML fragment showing the current progress of a task's checklist.

    Args:
        request: The HTTP request
        task_id: The task ID to get progress for

    Returns:
        HTTP response with rendered progress HTML
    """
    task = get_object_or_404(Task, pk=task_id)
    progress_data = get_checklist_progress(task)

    html = render_to_string(
        'tasks/_checklist_progress.html',
        progress_data,
    )
    return HttpResponse(html)


class CommentCreateView(LoginRequiredMixin, View):
    """
    View for creating new comments on tasks.

    Handles comment creation with permission checks and notification sending.
    """

    def post(self, request: HttpRequest, task_slug: str) -> HttpResponse:
        """
        Handle POST requests for comment creation.

        Args:
            request: The HTTP request
            task_slug: The task slug to comment on

        Returns:
            HTTP response with comment list or error
        """
        success, message, comment = create_comment(task_slug, request)
        return self._handle_comment_response(
            success, message, comment, task_slug, request
        )

    def _handle_comment_response(
        self,
        success: bool,
        message: str,
        comment,
        task_slug: str,
        request: HttpRequest,
    ) -> HttpResponse:
        """Handle comment operation response."""
        if success:
            response = comments_list_view(request, task_slug)
            if comment:
                self._add_comments_count_trigger(response, comment)
            return response
        return self._create_error_response(message)

    def _add_comments_count_trigger(
        self, response: HttpResponse, comment
    ) -> None:
        """Add comments count trigger to response."""
        comments_count = comment.task.comments.filter(is_deleted=False).count()
        response['HX-Trigger'] = json.dumps({
            'updateCommentsCount': {'count': comments_count}
        })

    def _create_error_response(self, message: str) -> HttpResponse:
        """Create error response with appropriate status."""
        status = HTTP_FORBIDDEN if 'прав' in message else HTTP_BAD_REQUEST
        return HttpResponse(
            f'<div class="notification is-danger">{message}</div>',
            status=status,
        )


class CommentUpdateView(LoginRequiredMixin, View):
    """
    View for updating existing comments.

    Handles comment updates with permission checks and timestamp tracking.
    """

    def post(self, request: HttpRequest, comment_id: int) -> HttpResponse:
        """
        Handle POST requests for comment updates.

        Args:
            request: The HTTP request
            comment_id: The comment ID to update

        Returns:
            HTTP response with updated comment list or error
        """
        success, message, comment = update_comment(comment_id, request)
        return self._handle_comment_update_response(
            success, message, comment, request
        )

    def _handle_comment_update_response(
        self, success: bool, message: str, comment, request: HttpRequest
    ) -> HttpResponse:
        """Handle comment update response."""
        if success:
            response = comments_list_view(request, comment.task.slug)
            self._add_comments_count_trigger(response, comment)
            return response
        return self._create_error_response(message)

    def _add_comments_count_trigger(
        self, response: HttpResponse, comment
    ) -> None:
        """Add comments count trigger to response."""
        comments_count = comment.task.comments.filter(is_deleted=False).count()
        response['HX-Trigger'] = json.dumps({
            'updateCommentsCount': {'count': comments_count}
        })

    def _create_error_response(self, message: str) -> HttpResponse:
        """Create error response with appropriate status."""
        status = HTTP_FORBIDDEN if 'прав' in message else HTTP_BAD_REQUEST
        return HttpResponse(
            f'<div class="notification is-danger">{message}</div>',
            status=status,
        )


class CommentDeleteView(LoginRequiredMixin, View):
    """
    View for deleting comments.

    Handles soft deletion of comments with permission checks.
    """

    def post(self, request: HttpRequest, comment_id: int) -> HttpResponse:
        """
        Handle POST requests for comment deletion.

        Args:
            request: The HTTP request
            comment_id: The comment ID to delete

        Returns:
            HTTP response with updated comment list or error
        """
        success, message = delete_comment(comment_id, request)
        return self._handle_comment_delete_response(
            success, message, comment_id, request
        )

    def _handle_comment_delete_response(
        self, success: bool, message: str, comment_id: int, request: HttpRequest
    ) -> HttpResponse:
        """Handle comment deletion response."""
        if success:
            return self._process_successful_deletion(comment_id, request)
        return self._create_error_response(message)

    def _process_successful_deletion(
        self, comment_id: int, request: HttpRequest
    ) -> HttpResponse:
        """Process successful comment deletion."""
        comment = get_object_or_404(Comment, id=comment_id)
        task_slug = comment.task.slug
        comment.soft_delete()

        response = comments_list_view(request, task_slug)
        self._add_comments_count_trigger(response, comment)
        return response

    def _add_comments_count_trigger(
        self, response: HttpResponse, comment
    ) -> None:
        """Add comments count trigger to response."""
        comments_count = comment.task.comments.filter(is_deleted=False).count()
        response['HX-Trigger'] = json.dumps({
            'updateCommentsCount': {'count': comments_count}
        })

    def _create_error_response(self, message: str) -> HttpResponse:
        """Create error response with appropriate status."""
        return HttpResponse(
            f'<div class="notification is-danger">{message}</div>',
            status=HTTP_FORBIDDEN,
        )


class CommentEditFormView(LoginRequiredMixin, View):
    """
    View for displaying comment edit forms.

    Provides AJAX endpoint for loading comment edit forms.
    """

    def get(self, request: HttpRequest, comment_id: int) -> HttpResponse:
        """
        Handle GET requests for comment edit forms.

        Args:
            request: The HTTP request
            comment_id: The comment ID to edit

        Returns:
            Rendered comment edit form or error
        """
        comment = get_object_or_404(Comment, id=comment_id)

        if not comment.can_edit(request.user):
            messages.error(
                request, 'У вас нет прав для редактирования этого комментария.'
            )
            return HttpResponse(status=HTTP_FORBIDDEN)

        return render(
            request, 'tasks/_comment_edit_form.html', {'comment': comment}
        )


class CommentViewView(LoginRequiredMixin, View):
    """
    View for displaying individual comments.

    Provides AJAX endpoint for viewing individual comment details.
    """

    def get(self, request: HttpRequest, comment_id: int) -> HttpResponse:
        """
        Handle GET requests for viewing comments.

        Args:
            request: The HTTP request
            comment_id: The comment ID to view

        Returns:
            Rendered comment view
        """
        comment = get_object_or_404(Comment, id=comment_id)
        return render(request, 'tasks/_comment.html', {'comment': comment})


def comments_list_view(request: HttpRequest, task_slug: str) -> HttpResponse:
    """
    View for displaying task comments with pagination.

    Returns a paginated list of comments for a specific task.

    Args:
        request: The HTTP request
        task_slug: The task slug to get comments for

    Returns:
        HTTP response with rendered comments list
    """
    context = get_comments_for_task(task_slug, request)
    return render(request, 'tasks/_comments_container.html', context)
