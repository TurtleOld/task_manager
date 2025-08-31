"""
Django views for the tasks app.

This module contains all view classes and functions for the task management system,
including task CRUD operations, kanban board views, comment management, and file handling.

The views are organized into several categories:
- Task management views (CRUD operations)
- Kanban board views for task organization
- Comment management views
- File handling views
- AJAX views for dynamic interactions

All views follow Django best practices and include proper authentication,
authorization, and error handling.
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
from django.views.generic import CreateView, DeleteView, DetailView, UpdateView
from django_filters.views import FilterView

from task_manager.constants import HTTP_BAD_REQUEST, HTTP_FORBIDDEN, HTTP_OK
from task_manager.tasks.forms import CommentForm, TaskForm, TasksFilter
from task_manager.tasks.models import Comment, Stage, Task
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

    This view provides a filterable list view of tasks with authentication
    requirements and success message handling. It extends Django's FilterView
    to provide advanced filtering capabilities for task management.

    Attributes:
        model: The Task model to display
        template_name: Template for rendering the task list
        context_object_name: Name for the tasks in template context
        filterset_class: Class for handling task filtering
        error_message: Message shown when user lacks permissions
        no_permission_url: URL to redirect unauthorized users
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

    This view displays tasks organized by stages in a kanban board format,
    with filtering capabilities and JSON data for JavaScript interactions.
    It provides a visual representation of task workflow and allows for
    drag-and-drop task management.

    Attributes:
        template_name: Template for rendering the kanban board
    """

    template_name = 'tasks/kanban.html'

    def get(self, request, *args, **kwargs):
        """
        Handle GET requests for the kanban board.

        Retrieves kanban data including tasks organized by stages and
        renders the kanban board template with the appropriate context.

        Args:
            request: The HTTP request object
            *args: Additional positional arguments
            **kwargs: Additional keyword arguments

        Returns:
            Rendered kanban board with task data and stage information
        """
        context = get_kanban_data(request)
        return render(request, 'tasks/kanban.html', context)


class CreateStageView(LoginRequiredMixin, SuccessMessageMixin, CreateView):
    """
    View for creating new task stages.

    This view provides a form for creating new stages in the task workflow.
    It extends Django's CreateView to handle stage creation with proper
    authentication and success message handling.

    Attributes:
        model: The Stage model to create
        template_name: Template for rendering the stage creation form
        fields: All fields from the Stage model
        success_url: URL to redirect after successful stage creation
    """

    model = Stage
    template_name = 'tasks/create_stage.html'
    fields = '__all__'
    success_url = reverse_lazy('tasks:list')


class UpdateTaskStageView(View):
    """
    AJAX view for updating task stages and positions.

    This view handles drag-and-drop operations for moving tasks between
    stages and reordering tasks within stages. It processes AJAX requests
    and returns JSON responses indicating success or failure.

    The view expects JSON data containing task_id, new_stage_id, and
    new_order parameters for updating task positions.
    """

    def post(self, request, *args, **kwargs) -> JsonResponse:
        """
        Handle POST requests for updating task stages and positions.

        Processes AJAX requests containing task update data and returns
        a JSON response indicating the success or failure of the operation.

        Args:
            request: The HTTP request object containing JSON data
            *args: Additional positional arguments
            **kwargs: Additional keyword arguments

        Returns:
            JSON response indicating success or failure with error details
        """
        try:
            return self._process_task_update_request(request)
        except Exception as error:
            return JsonResponse({'success': False, 'error': str(error)})

    def _process_task_update_request(self, request) -> JsonResponse:
        """
        Process task update request.

        Extracts task update data from the request and validates it before
        calling the service function to perform the actual update.

        Args:
            request: The HTTP request object containing JSON data

        Returns:
            JSON response with update result
        """
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
        """
        Check if update request is valid.

        Validates that the required parameters are present and properly
        formatted for a task update operation.

        Args:
            task_id: The ID of the task to update
            new_stage_id: The new stage ID for the task
            new_order: The new order position for the task

        Returns:
            True if the request is valid, False otherwise
        """
        if not task_id:
            return False
        return new_stage_id is not None or new_order is not None


class UpdateTaskOrderView(View):
    """
    AJAX view for updating task order in bulk.

    This view handles bulk updates of task positions and stages from the
    kanban board. It processes multiple task updates in a single request
    and returns a JSON response indicating the overall success or failure.

    The view expects JSON data containing an array of task objects with
    their new positions and stage assignments.
    """

    def post(self, request) -> JsonResponse:
        """
        Handle POST requests for bulk task order updates.

        Processes bulk task update requests containing multiple task
        modifications and applies them using the service layer.

        Args:
            request: The HTTP request object containing JSON data

        Returns:
            JSON response indicating success or failure of bulk update
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

    This view provides a form for creating new tasks with checklist support,
    notification scheduling, and proper validation. It extends Django's
    CreateView to handle task creation with additional business logic.

    Attributes:
        model: The Task model to create
        template_name: Template for rendering the task creation form
        form_class: Form class for task creation
        success_message: Message shown after successful task creation
        success_url: URL to redirect after successful task creation
        error_message: Message shown when user lacks permissions
        no_permission_url: URL to redirect unauthorized users
        query_pk_and_slug: Whether to use both pk and slug in URLs
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

        Extends the parent method to include the request object in form
        keyword arguments, allowing the form to access request data.

        Returns:
            Dictionary of form keyword arguments including request
        """
        kwargs = super().get_form_kwargs()
        kwargs['request'] = self.request
        return kwargs

    def form_valid(self, form: TaskForm) -> HttpResponse:
        """
        Handle valid form submission for task creation.

        Processes the validated task form, creates the task with checklist
        items, sends notifications, and handles any integrity errors that
        may occur during task creation.

        Args:
            form: The validated task form

        Returns:
            HTTP response after successful task creation or form re-render
            on error
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

    This view provides a form for editing tasks with checklist support
    and proper validation. It extends Django's UpdateView to handle task
    updates with additional business logic for checklist processing.

    Attributes:
        template_name: Template for rendering the task update form
        query_pk_and_slug: Whether to use both pk and slug in URLs
        form_class: Form class for task updates
        model: The Task model to update
        context_object_name: Name for the task in template context
    """

    template_name = 'tasks/update_task.html'
    query_pk_and_slug = True
    form_class = TaskForm
    model = Task
    context_object_name = 'tasks'

    def get_form_kwargs(self) -> dict[str, Any]:
        """
        Get form keyword arguments including the request object.

        Extends the parent method to include the request object in form
        keyword arguments, allowing the form to access request data.

        Returns:
            Dictionary of form keyword arguments including request
        """
        kwargs = super().get_form_kwargs()
        kwargs['request'] = self.request
        return kwargs

    def get_context_data(self, **kwargs: dict[str, Any]) -> dict[str, Any]:
        """
        Get context data including checklist information.

        Extends the parent method to include checklist data in the template
        context, allowing the frontend to display and manage checklist items.

        Args:
            **kwargs: Additional context data

        Returns:
            Dictionary of context data including checklist information
        """
        context = super().get_context_data(**kwargs)
        form = context['form']
        context['checklist_data'] = json.dumps(form.checklist_data)
        return context

    def form_valid(self, form: TaskForm) -> HttpResponse:
        """
        Handle valid form submission for task updates.

        Processes the validated task form, handles checklist items, and
        updates the task with the new data including any checklist changes.

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

    This view provides task deletion functionality with permission checks
    and notification sending. It extends Django's DeleteView to handle
    task deletion with additional security and business logic.

    Attributes:
        template_name: Template for rendering the task deletion confirmation
        model: The Task model to delete
        success_url: URL to redirect after successful task deletion
        success_message: Message shown after successful task deletion
        context_object_name: Name for the task in template context
    """

    template_name = 'tasks/task_confirm_delete.html'
    model = Task
    success_url = reverse_lazy('tasks:list')
    success_message = 'Задача успешно удалена'
    context_object_name = 'tasks'

    def test_func(self):
        """
        Test if the user can delete the task.

        Checks whether the current user is the author of the task,
        ensuring only task authors can delete their own tasks.

        Returns:
            True if the user is the task author, False otherwise
        """
        task = self.get_object()
        return self.request.user == task.author

    def handle_no_permission(self):
        """
        Handle cases where the user doesn't have permission to delete the task.

        Displays an error message and redirects the user to the task list
        when they attempt to delete a task they don't own.

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

        Processes the task deletion, sends notifications, and handles
        the response with appropriate success messages.

        Args:
            request: The HTTP request object
            *args: Additional positional arguments
            **kwargs: Additional keyword arguments

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

        Displays an error message and redirects the user when form
        validation fails during task deletion.

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

    This view handles task state changes with permission checks and
    notifications. It allows users to close or reopen tasks based on
    their current state and permissions.

    Attributes:
        model: The Task model to operate on
        template_name: Template for rendering task views
        form_class: Form class for task operations
        slug_field: Field name for the slug
        slug_url_kwarg: URL keyword argument for the slug
    """

    model = Task
    template_name = 'tasks/kanban.html'
    form_class = TaskForm
    slug_field = 'slug'
    slug_url_kwarg = 'slug'

    def post(self, request: HttpRequest, slug: str) -> HttpResponse:
        """
        Handle POST requests for closing/reopening tasks.

        Processes requests to change task state (close or reopen) and
        displays appropriate success or error messages.

        Args:
            request: The HTTP request object
            slug: The task slug identifier

        Returns:
            Redirect response after state change with appropriate message
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

    This view shows comprehensive task information including comments,
    checklist progress, and related data with pagination support.
    It extends Django's DetailView to provide rich task detail display.

    Attributes:
        model: The Task model to display
        template_name: Template for rendering task details
        context_object_name: Name for the task in template context
        error_message: Message shown when user lacks permissions
        no_permission_url: URL to redirect unauthorized users
        query_pk_and_slug: Whether to use both pk and slug in URLs
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

        Extends the parent method to include comprehensive task context
        data including comments, checklist progress, labels, and comment
        form for adding new comments.

        Args:
            **kwargs: Additional context data

        Returns:
            Dictionary of context data with task details and related information
        """
        context = super().get_context_data(**kwargs)
        task = self.get_object()
        context.update(get_task_context_data(task, self.request))
        context['comment_form'] = CommentForm()
        return context


class ChecklistItemToggle(View):
    """
    AJAX view for toggling checklist item completion status.

    This view handles checkbox toggles for checklist items with real-time
    updates. It processes AJAX requests to toggle the completion status
    of individual checklist items and returns updated HTML.

    Attributes:
        template_name: Template for rendering checklist item updates
    """

    template_name = 'tasks/checklist_item.html'

    def post(self, request: HttpRequest, pk: int) -> HttpResponse:
        """
        Handle POST requests for toggling checklist items.

        Processes requests to toggle the completion status of checklist
        items and returns updated HTML for the item.

        Args:
            request: The HTTP request object
            pk: The checklist item primary key

        Returns:
            Rendered checklist item template with updated status
        """
        checklist_item = toggle_checklist_item(pk)
        context = {'item': checklist_item}
        return render(request, self.template_name, context)


class DownloadFileView(DetailView[Task]):
    """
    View for downloading task images.

    This view provides secure file download functionality for task images
    with proper MIME type detection and filename handling. It extends
    Django's DetailView to handle file downloads with security considerations.

    Attributes:
        model: The Task model containing the image
    """

    model = Task

    def get(self, request: HttpRequest, *args, **kwargs) -> FileResponse:
        """
        Handle GET requests for file downloads.

        Processes file download requests, determines the correct MIME type,
        and returns a secure file response with proper headers.

        Args:
            request: The HTTP request object
            *args: Additional positional arguments
            **kwargs: Additional keyword arguments

        Returns:
            FileResponse for the task image with proper headers

        Raises:
            Http404: If the file is not found or inaccessible
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

    This function returns an HTML fragment showing the current progress
    of a task's checklist. It's designed for AJAX requests to update
    progress indicators without full page reloads.

    Args:
        request: The HTTP request object
        task_id: The task ID to get progress for

    Returns:
        HTTP response with rendered progress HTML fragment
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

    This view handles comment creation with permission checks and
    notification sending. It processes AJAX requests to create new
    comments and returns updated comment lists.

    The view ensures that only authenticated users can create comments
    and provides appropriate error handling for various scenarios.
    """

    def post(self, request: HttpRequest, task_slug: str) -> HttpResponse:
        """
        Handle POST requests for comment creation.

        Processes comment creation requests, validates permissions,
        creates the comment, and returns updated comment list or error.

        Args:
            request: The HTTP request object
            task_slug: The task slug to comment on

        Returns:
            HTTP response with comment list or error message
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
        """
        Handle comment operation response.

        Processes the result of comment operations and returns appropriate
        responses including success updates or error messages.

        Args:
            success: Whether the comment operation was successful
            message: Response message from the operation
            comment: The created comment object (if successful)
            task_slug: The task slug for context
            request: The HTTP request object

        Returns:
            HTTP response with updated comment list or error
        """
        if success:
            response = comments_list_view(request, task_slug)
            if comment:
                self._add_comments_count_trigger(response, comment)
            return response
        return self._create_error_response(message)

    def _add_comments_count_trigger(
        self, response: HttpResponse, comment
    ) -> None:
        """
        Add comments count trigger to response.

        Adds HTMX trigger headers to update comment counts in the
        frontend when comments are created, updated, or deleted.

        Args:
            response: The HTTP response to modify
            comment: The comment object for context
        """
        comments_count = comment.task.comments.filter(is_deleted=False).count()
        response['HX-Trigger'] = json.dumps({
            'updateCommentsCount': {'count': comments_count}
        })

    def _create_error_response(self, message: str) -> HttpResponse:
        """
        Create error response with appropriate status.

        Creates an error response with the appropriate HTTP status code
        based on the error message content.

        Args:
            message: The error message to display

        Returns:
            HTTP response with error message and appropriate status
        """
        status = HTTP_FORBIDDEN if 'прав' in message else HTTP_BAD_REQUEST
        return HttpResponse(
            f'<div class="notification is-danger">{message}</div>',
            status=status,
        )


class CommentUpdateView(LoginRequiredMixin, View):
    """
    View for updating existing comments.

    This view handles comment updates with permission checks and
    timestamp tracking. It processes AJAX requests to update existing
    comments and returns updated comment lists.

    The view ensures that only comment authors can update their comments
    and provides appropriate error handling for various scenarios.
    """

    def post(self, request: HttpRequest, comment_id: int) -> HttpResponse:
        """
        Handle POST requests for comment updates.

        Processes comment update requests, validates permissions,
        updates the comment, and returns updated comment list or error.

        Args:
            request: The HTTP request object
            comment_id: The comment ID to update

        Returns:
            HTTP response with updated comment list or error message
        """
        success, message, comment = update_comment(comment_id, request)
        return self._handle_comment_update_response(
            success, message, comment, request
        )

    def _handle_comment_update_response(
        self, success: bool, message: str, comment, request: HttpRequest
    ) -> HttpResponse:
        """
        Handle comment update response.

        Processes the result of comment update operations and returns
        appropriate responses including success updates or error messages.

        Args:
            success: Whether the comment update was successful
            message: Response message from the operation
            comment: The updated comment object (if successful)
            request: The HTTP request object

        Returns:
            HTTP response with updated comment list or error
        """
        if success:
            response = comments_list_view(request, comment.task.slug)
            self._add_comments_count_trigger(response, comment)
            return response
        return self._create_error_response(message)

    def _add_comments_count_trigger(
        self, response: HttpResponse, comment
    ) -> None:
        """
        Add comments count trigger to response.

        Adds HTMX trigger headers to update comment counts in the
        frontend when comments are created, updated, or deleted.

        Args:
            response: The HTTP response to modify
            comment: The comment object for context
        """
        comments_count = comment.task.comments.filter(is_deleted=False).count()
        response['HX-Trigger'] = json.dumps({
            'updateCommentsCount': {'count': comments_count}
        })

    def _create_error_response(self, message: str) -> HttpResponse:
        """
        Create error response with appropriate status.

        Creates an error response with the appropriate HTTP status code
        based on the error message content.

        Args:
            message: The error message to display

        Returns:
            HTTP response with error message and appropriate status
        """
        status = HTTP_FORBIDDEN if 'прав' in message else HTTP_BAD_REQUEST
        return HttpResponse(
            f'<div class="notification is-danger">{message}</div>',
            status=status,
        )


class CommentDeleteView(LoginRequiredMixin, View):
    """
    View for deleting comments.

    This view handles soft deletion of comments with permission checks.
    It processes AJAX requests to delete comments and returns updated
    comment lists.

    The view ensures that only comment authors can delete their comments
    and provides appropriate error handling for various scenarios.
    """

    def post(self, request: HttpRequest, comment_id: int) -> HttpResponse:
        """
        Handle POST requests for comment deletion.

        Processes comment deletion requests, validates permissions,
        performs soft deletion, and returns updated comment list or error.

        Args:
            request: The HTTP request object
            comment_id: The comment ID to delete

        Returns:
            HTTP response with updated comment list or error message
        """
        success, message = delete_comment(comment_id, request)
        return self._handle_comment_delete_response(
            success, message, comment_id, request
        )

    def _handle_comment_delete_response(
        self, success: bool, message: str, comment_id: int, request: HttpRequest
    ) -> HttpResponse:
        """
        Handle comment deletion response.

        Processes the result of comment deletion operations and returns
        appropriate responses including success updates or error messages.

        Args:
            success: Whether the comment deletion was successful
            message: Response message from the operation
            comment_id: The ID of the deleted comment
            request: The HTTP request object

        Returns:
            HTTP response with updated comment list or error
        """
        if success:
            return self._process_successful_deletion(comment_id, request)
        return self._create_error_response(message)

    def _process_successful_deletion(
        self, comment_id: int, request: HttpRequest
    ) -> HttpResponse:
        """
        Process successful comment deletion.

        Handles the successful deletion of a comment by performing
        soft deletion and returning updated comment list.

        Args:
            comment_id: The ID of the comment to delete
            request: The HTTP request object

        Returns:
            HTTP response with updated comment list
        """
        comment = get_object_or_404(Comment, id=comment_id)
        task_slug = comment.task.slug
        comment.soft_delete()

        response = comments_list_view(request, task_slug)
        self._add_comments_count_trigger(response, comment)
        return response

    def _add_comments_count_trigger(
        self, response: HttpResponse, comment
    ) -> None:
        """
        Add comments count trigger to response.

        Adds HTMX trigger headers to update comment counts in the
        frontend when comments are created, updated, or deleted.

        Args:
            response: The HTTP response to modify
            comment: The comment object for context
        """
        comments_count = comment.task.comments.filter(is_deleted=False).count()
        response['HX-Trigger'] = json.dumps({
            'updateCommentsCount': {'count': comments_count}
        })

    def _create_error_response(self, message: str) -> HttpResponse:
        """
        Create error response with appropriate status.

        Creates an error response with the appropriate HTTP status code
        for comment deletion errors.

        Args:
            message: The error message to display

        Returns:
            HTTP response with error message and forbidden status
        """
        return HttpResponse(
            f'<div class="notification is-danger">{message}</div>',
            status=HTTP_FORBIDDEN,
        )


class CommentEditFormView(LoginRequiredMixin, View):
    """
    View for displaying comment edit forms.

    This view provides an AJAX endpoint for loading comment edit forms.
    It validates user permissions before allowing access to edit forms
    and returns the appropriate form or error response.

    The view ensures that only comment authors can access edit forms
    for their comments.
    """

    def get(self, request: HttpRequest, comment_id: int) -> HttpResponse:
        """
        Handle GET requests for comment edit forms.

        Retrieves a comment and checks if the user has permission to
        edit it before returning the edit form or an error response.

        Args:
            request: The HTTP request object
            comment_id: The comment ID to edit

        Returns:
            Rendered comment edit form or error response
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

    This view provides an AJAX endpoint for viewing individual comment
    details. It's designed for displaying comment content in modals
    or other dynamic UI elements.

    The view ensures that only authenticated users can view comments
    and provides a clean interface for comment display.
    """

    def get(self, request: HttpRequest, comment_id: int) -> HttpResponse:
        """
        Handle GET requests for viewing comments.

        Retrieves a comment and returns its rendered view for display
        in dynamic UI elements.

        Args:
            request: The HTTP request object
            comment_id: The comment ID to view

        Returns:
            Rendered comment view
        """
        comment = get_object_or_404(Comment, id=comment_id)
        return render(request, 'tasks/_comment.html', {'comment': comment})


def comments_list_view(request: HttpRequest, task_slug: str) -> HttpResponse:
    """
    View for displaying task comments with pagination.

    This function returns a paginated list of comments for a specific task.
    It's designed for AJAX requests to update comment lists without
    full page reloads.

    Args:
        request: The HTTP request object
        task_slug: The task slug to get comments for

    Returns:
        HTTP response with rendered comments list
    """
    context = get_comments_for_task(task_slug, request)
    return render(request, 'tasks/_comments_container.html', context)
