"""
Django views for the tasks app.

This module contains all view classes and functions for the task management system,
including task CRUD operations, kanban board views, comment management, and file handling.
"""

import json
import mimetypes
import os
from typing import Any
from urllib.parse import quote

from django.contrib import messages
from django.contrib.auth.mixins import LoginRequiredMixin, UserPassesTestMixin
from django.contrib.messages.views import SuccessMessageMixin
from django.core.paginator import Paginator
from django.db import IntegrityError, transaction
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
from django.utils import timezone
from django.utils.translation import gettext_lazy as _
from django.views import View
from django.views.generic import (
    CreateView,
    DeleteView,
    DetailView,
    UpdateView,
)
from django_filters.views import FilterView

from task_manager.labels.models import Label
from task_manager.tasks.forms import CommentForm, TaskForm, TasksFilter
from task_manager.tasks.models import (
    ChecklistItem,
    Comment,
    Stage,
    Task,
    reorder_task_within_stage,
    reorder_tasks_in_stage,
)
from task_manager.tasks.services import notify, slugify_translit
from task_manager.tasks.tasks import (
    send_about_closing_task,
    send_about_deleting_task,
    send_about_moving_task,
    send_about_opening_task,
    send_comment_notification,
    send_message_about_adding_task,
)
from task_manager.users.models import User


class TasksList(
    LoginRequiredMixin,
    SuccessMessageMixin[Any],
    FilterView[Task],
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
    FilterView[Task],
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
        labels = Label.objects.all().order_by('name')
        selected_labels = request.GET.getlist('labels')
        stages = Stage.objects.prefetch_related('tasks').order_by('order')

        tasks_data = []
        for stage in stages:
            stage_tasks = stage.tasks.all()
            if selected_labels:
                stage_tasks = stage_tasks.filter(
                    labels__id__in=selected_labels
                ).distinct()

            for task in stage_tasks:
                task_labels = list(task.labels.values('id', 'name'))

                tasks_data.append(
                    {
                        'id': task.id,
                        'name': task.name,
                        'slug': task.slug,
                        'author': {
                            'username': (task.author.username if task.author else ''),
                            'full_name': (
                                task.author.get_full_name() if task.author else ''
                            ),
                        },
                        'executor': {
                            'username': (
                                task.executor.username if task.executor else ''
                            ),
                            'full_name': (
                                task.executor.get_full_name() if task.executor else ''
                            ),
                        },
                        'created_at': task.created_at.strftime('%d.%m.%Y %H:%M'),
                        'stage': task.stage_id,
                        'labels': task_labels,
                    }
                )
        return render(
            request,
            template_name=self.template_name,
            context={
                'stages': stages,
                'tasks': json.dumps(tasks_data, default=str, ensure_ascii=False),
                'labels': labels,
                'selected_labels': selected_labels,
            },
        )


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

    def post(self, request, *args, **kwargs):
        """
        Handle POST requests for updating task stages and positions.

        Returns:
            JSON response indicating success or failure
        """
        try:
            data = json.loads(request.body)
            task_id = data.get('task_id')
            new_stage_id = data.get('new_stage_id')
            new_order = data.get('new_order')

            if not task_id or (new_stage_id is None and new_order is None):
                return JsonResponse({'success': False, 'error': 'Invalid data'})

            with transaction.atomic():
                task = Task.objects.select_for_update().get(id=task_id)

                if new_stage_id is not None:
                    old_stage = task.stage
                    new_stage = (
                        Stage.objects.get(id=new_stage_id) if new_stage_id else None
                    )

                    if (
                        new_stage
                        and new_stage.name == 'Done'
                        and task.author != request.user
                    ):
                        messages.error(
                            request,
                            _('Only the task author can move it to Done'),
                        )
                        if (
                            request.headers.get('X-Requested-With')
                            == 'XMLHttpRequest'
                        ):
                            messages_html = render_to_string(
                                'includes/messages.html',
                                {'messages': messages.get_messages(request)},
                            )
                            return JsonResponse(
                                {
                                    'success': False,
                                    'error': 'Only the task author can move it to Done',
                                    'messages_html': messages_html,
                                }
                            )
                        return JsonResponse(
                            {
                                'success': False,
                                'error': 'Only the task author can move it to Done',
                            }
                        )

                    if old_stage != new_stage and new_stage:
                        task.stage = new_stage
                        task.save()

                        task_url = request.build_absolute_uri(f'/tasks/{task.slug}')
                        moved_by = request.user.get_full_name() or request.user.username
                        send_about_moving_task.delay(
                            task.name,
                            moved_by,
                            new_stage.name,
                            task_url,
                        )

                        if old_stage:
                            reorder_tasks_in_stage(old_stage.pk)
                        if new_stage:
                            reorder_tasks_in_stage(new_stage.pk)

                if new_order is not None:
                    reorder_task_within_stage(task, new_order)

            return JsonResponse({'success': True})
        except Task.DoesNotExist:
            return JsonResponse({'success': False, 'error': 'Task not found'})
        except Stage.DoesNotExist:
            return JsonResponse({'success': False, 'error': 'Stage not found'})
        except Exception as e:
            return JsonResponse({'success': False, 'error': str(e)})


class UpdateTaskOrderView(View):
    """
    AJAX view for updating task order in bulk.

    Handles bulk updates of task positions and stages from the kanban board.
    """

    def post(self, request):
        """
        Handle POST requests for bulk task order updates.

        Returns:
            JSON response indicating success or failure
        """
        try:
            data = json.loads(request.body)
            tasks_data = data.get('tasks', [])

            for task_data in tasks_data:
                task_id = task_data.get('task_id')
                stage_id = task_data.get('stage_id')
                order = task_data.get('order')

                if task_id is None or stage_id is None or order is None:
                    raise ValueError('Invalid task data')

                task = Task.objects.filter(pk=task_id).first()
                if task:
                    old_stage_id = task.stage_id
                    task.stage_id = stage_id
                    task.order = order
                    task.save()

                    if old_stage_id != stage_id:
                        new_stage = Stage.objects.get(id=stage_id)
                        task_url = request.build_absolute_uri(f'/tasks/{task.slug}')
                        moved_by = request.user.get_full_name() or request.user.username
                        send_about_moving_task.delay(
                            task.name, moved_by, new_stage.name, task_url
                        )
                else:
                    raise ValueError(f'Task with ID {task_id} not found')

            return JsonResponse({'message': 'Tasks successfully updated'}, status=200)

        except Exception as e:
            return JsonResponse({'error': str(e)}, status=400)


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
            form.instance.author = User.objects.get(pk=self.request.user.pk)
            task = form.save(commit=False)
            task_name = task.name
            task.slug = slugify_translit(task_name)
            task.stage_id = 1
            task = form.save()
            task_slug = task.slug

            checklist_items = []
            i = 0
            while f'checklist_items[{i}][description]' in self.request.POST:
                description = self.request.POST.get(
                    f'checklist_items[{i}][description]', ''
                ).strip()
                is_completed = (
                    self.request.POST.get(
                        f'checklist_items[{i}][is_completed]', 'false'
                    )
                    == 'true'
                )
                if description:
                    checklist_items.append(
                        {'description': description, 'is_completed': is_completed}
                    )
                i += 1

            form.cleaned_data = form.cleaned_data or {}
            form.cleaned_data['checklist_items'] = checklist_items

            form.save_checklist_items(task)
            task_image = task.image
            deadline = task.deadline
            reminder_periods = form.cleaned_data['reminder_periods']
            task_url = self.request.build_absolute_uri(f'/tasks/{task_slug}')
            send_message_about_adding_task.delay(task_name, task_url)
            task_image_path = task.image.path if task_image else None
            if deadline and reminder_periods and os.environ.get('TOKEN_TELEGRAM_BOT'):
                notify(
                    task_name,
                    reminder_periods,
                    deadline,
                    task_image_path,
                    task_url,
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
        checklist_items = []
        i = 0
        while f'checklist_items[{i}][description]' in self.request.POST:
            description = self.request.POST.get(
                f'checklist_items[{i}][description]', ''
            ).strip()
            is_completed = (
                self.request.POST.get(f'checklist_items[{i}][is_completed]', 'false')
                == 'true'
            )
            if description:
                checklist_items.append(
                    {'description': description, 'is_completed': is_completed}
                )
            i += 1

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
        return redirect(self.success_url)

    def delete(self, request, *args, **kwargs):
        """
        Handle task deletion with notification.

        Returns:
            Redirect response after successful deletion
        """
        task = self.get_object()

        task_name = task.name
        send_about_deleting_task.delay(task_name)
        task.delete()

        messages.success(request, self.success_message)

        return redirect(self.success_url)

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
        return redirect(self.success_url)


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
        task = get_object_or_404(Task, slug=slug)
        task_url = self.request.build_absolute_uri(f'/tasks/{slug}')
        if task.author != request.user or task.executor != request.user:
            messages.error(
                request,
                _('У вас нет прав для изменения состояния этой задачи'),
            )
        else:
            task.state = not task.state
            messages.success(
                request,
                _('Статус задачи изменен.'),
            )
            if task.state:
                send_about_closing_task.delay(task.name, task_url)
                task.save()
            else:
                send_about_opening_task.delay(task.name, task_url)
                task.save()
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
        context['labels'] = self.get_object().labels.all()

        if hasattr(task, 'checklist'):
            checklist_items = task.checklist.items.all()
            context['checklist_items'] = checklist_items
            total_checklist = checklist_items.count()
            done_checklist = checklist_items.filter(is_completed=True).count()
            progress_checklist = (
                int(done_checklist / total_checklist * 100) if total_checklist else 0
            )
            context['total_checklist'] = total_checklist
            context['done_checklist'] = done_checklist
            context['progress_checklist'] = progress_checklist
        else:
            context['checklist_items'] = []
            context['total_checklist'] = 0
            context['done_checklist'] = 0
            context['progress_checklist'] = 0

        comments = task.comments.filter(is_deleted=False).order_by('-created_at')
        paginator = Paginator(comments, 10)
        page_number = self.request.GET.get('page')
        page_obj = paginator.get_page(page_number)
        context['comments'] = page_obj

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
        checklist_item = get_object_or_404(ChecklistItem, pk=pk)
        checklist_item.is_completed = not checklist_item.is_completed
        checklist_item.save()
        context = {
            'item': checklist_item,
        }
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
            response = FileResponse(
                open(image_path, 'rb'),
                content_type=mime_type,
            )
            quote_filename = quote(os.path.basename(image_name))
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
    if hasattr(task, 'checklist'):
        checklist_items = task.checklist.items.all()
        total_checklist = checklist_items.count()
        done_checklist = checklist_items.filter(is_completed=True).count()
        progress_checklist = (
            int(done_checklist / total_checklist * 100) if total_checklist else 0
        )
    else:
        total_checklist = 0
        done_checklist = 0
        progress_checklist = 0
    html = render_to_string(
        'tasks/_checklist_progress.html',
        {
            'progress_checklist': progress_checklist,
            'done_checklist': done_checklist,
            'total_checklist': total_checklist,
        },
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
        task = get_object_or_404(Task, slug=task_slug)

        if request.user not in [task.author, task.executor] and task.executor:
            messages.error(
                request, 'У вас нет прав для добавления комментариев к этой задаче.'
            )
            return HttpResponse(status=403)

        form = CommentForm(request.POST)
        if form.is_valid():
            comment = form.save(commit=False)
            comment.task = task
            comment.author = request.user
            comment.save()

            if task.executor and task.executor != request.user:
                send_comment_notification.delay(comment.id)

            response = comments_list_view(request, task_slug)

            comments_count = task.comments.filter(is_deleted=False).count()
            response['HX-Trigger'] = json.dumps(
                {'updateCommentsCount': {'count': comments_count}}
            )

            return response
        else:
            return HttpResponse(
                f'<div class="notification is-danger">Ошибка: {form.errors}</div>',
                status=400,
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
        comment = get_object_or_404(Comment, id=comment_id)

        if not comment.can_edit(request.user):
            messages.error(
                request, 'У вас нет прав для редактирования этого комментария.'
            )
            return HttpResponse(status=403)

        form = CommentForm(request.POST, instance=comment)
        if form.is_valid():
            comment = form.save(commit=False)
            comment.updated_at = timezone.now()
            comment.save()

            task = comment.task
            response = comments_list_view(request, task.slug)

            comments_count = task.comments.filter(is_deleted=False).count()
            response['HX-Trigger'] = json.dumps(
                {'updateCommentsCount': {'count': comments_count}}
            )

            return response
        else:
            return HttpResponse(
                f'<div class="notification is-danger">Ошибка: {form.errors}</div>',
                status=400,
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
        comment = get_object_or_404(Comment, id=comment_id)

        if not comment.can_delete(request.user):
            messages.error(request, 'У вас нет прав для удаления этого комментария.')
            return HttpResponse(status=403)

        comment.soft_delete()

        task = comment.task
        response = comments_list_view(request, task.slug)

        comments_count = task.comments.filter(is_deleted=False).count()
        response['HX-Trigger'] = json.dumps(
            {'updateCommentsCount': {'count': comments_count}}
        )

        return response


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
            return HttpResponse(status=403)

        return render(request, 'tasks/_comment_edit_form.html', {'comment': comment})


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
    task = get_object_or_404(Task, slug=task_slug)
    comments = task.comments.filter(is_deleted=False).order_by('-created_at')

    paginator = Paginator(comments, 10)
    page_number = request.GET.get('page')
    page_obj = paginator.get_page(page_number)

    return render(
        request,
        'tasks/_comments_container.html',
        {
            'comments': page_obj,
            'task': task,
        },
    )
