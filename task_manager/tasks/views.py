"""
Django views for the tasks app.

This module contains all view classes and functions for the task management
system, including task CRUD operations, kanban board views, comment
management, and file handling.
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
    template_name = 'tasks/kanban.html'

    def get(self, request, *args, **kwargs):
        context = get_kanban_data(request)
        return render(request, 'tasks/kanban.html', context)


class CreateStageView(LoginRequiredMixin, SuccessMessageMixin, CreateView):
    model = Stage
    template_name = 'tasks/create_stage.html'
    fields = '__all__'
    success_url = reverse_lazy('tasks:list')


class UpdateTaskStageView(View):
    def post(self, request, *args, **kwargs) -> JsonResponse:
        try:
            return self._process_task_update_request(request)
        except Exception as error:
            return JsonResponse({'success': False, 'error': str(error)})

    def _process_task_update_request(self, request) -> JsonResponse:
        request_data = json.loads(request.body)
        task_id = request_data.get('task_id')
        new_stage_id = request_data.get('new_stage_id')
        new_order = request_data.get('new_order')

        if not self._is_valid_update_request(task_id, new_stage_id, new_order):
            return JsonResponse({'success': False, 'error': 'Invalid data'})

        update_result = update_task_stage_and_order(
            task_id, new_stage_id, new_order
        )
        return JsonResponse(update_result)

    def _is_valid_update_request(
        self, task_id, new_stage_id, new_order
    ) -> bool:
        if not task_id:
            return False
        return new_stage_id is not None or new_order is not None


class UpdateTaskOrderView(View):
    def post(self, request) -> JsonResponse:
        try:
            request_data = json.loads(request.body)
            tasks_data = request_data.get('tasks', [])

            if not tasks_data:
                return JsonResponse(
                    {'error': 'No tasks data provided'}, status=HTTP_BAD_REQUEST
                )

            process_bulk_task_updates(tasks_data)
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
        kwargs = super().get_form_kwargs()
        kwargs['request'] = self.request
        return kwargs

    def form_valid(self, form: TaskForm) -> HttpResponse:
        try:
            task, task_slug = create_task_with_checklist(form, self.request)
            send_task_creation_notifications(task.name)
            return super().form_valid(form)
        except IntegrityError:
            messages.error(
                self.request,
                'Задача с таким названием уже существует.',
            )
            return self.form_invalid(form)


class UpdateTask(
    LoginRequiredMixin,
    SuccessMessageMixin,
    UpdateView,
):
    template_name = 'tasks/update_task.html'
    query_pk_and_slug = True
    form_class = TaskForm
    model = Task
    context_object_name = 'tasks'

    def get_form_kwargs(self) -> dict[str, Any]:
        kwargs = super().get_form_kwargs()
        kwargs['request'] = self.request
        return kwargs

    def get_context_data(self, **kwargs: dict[str, Any]) -> dict[str, Any]:
        context = super().get_context_data(**kwargs)
        form = context['form']
        context['checklist_data'] = json.dumps(form.checklist_data)
        return context

    def form_valid(self, form: TaskForm) -> HttpResponse:
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
    template_name = 'tasks/task_confirm_delete.html'
    model = Task
    success_url = reverse_lazy('tasks:list')
    success_message = 'Задача успешно удалена'
    context_object_name = 'tasks'

    def test_func(self):
        task = self.get_object()
        return self.request.user == task.author

    def handle_no_permission(self):
        messages.error(
            self.request,
            'Вы не можете удалить чужую задачу!',
        )
        return redirect('tasks:list')

    def delete(self, request, *args, **kwargs) -> HttpResponse:
        task = self.get_object()
        delete_task_with_notification(task)

        messages.success(request, self.success_message)
        return redirect('tasks:list')

    def form_invalid(self, form: ModelForm[Task]) -> HttpResponse:
        messages.error(
            self.request,
            _('Вы не можете удалить чужую задачу!'),
        )
        return redirect('tasks:list')


class CloseTask(View):
    model = Task
    template_name = 'tasks/kanban.html'
    form_class = TaskForm
    slug_field = 'slug'
    slug_url_kwarg = 'slug'

    def post(self, request: HttpRequest, slug: str) -> HttpResponse:
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
    model = Task
    template_name = 'tasks/view_task.html'
    context_object_name = 'task'
    error_message = _(
        'У вас нет прав на просмотр данной страницы! Авторизуйтесь!'
    )
    no_permission_url = reverse_lazy('login')
    query_pk_and_slug = True

    def get_context_data(self, **kwargs: dict[str, Any]) -> dict[str, Any]:
        context = super().get_context_data(**kwargs)
        task = self.get_object()
        context.update(get_task_context_data(task, self.request))
        context['comment_form'] = CommentForm()
        return context


class ChecklistItemToggle(View):
    template_name = 'tasks/checklist_item.html'

    def post(self, request: HttpRequest, pk: int) -> HttpResponse:
        checklist_item = toggle_checklist_item(pk)
        context = {'item': checklist_item}
        return render(request, self.template_name, context)


class DownloadFileView(View):
    def get(self, request: HttpRequest, slug: str) -> FileResponse:
        task = get_object_or_404(Task, slug=slug)

        # Check if task has an image
        if not task.image:
            raise Http404('У задачи нет изображения')

        image_path = task.image.path
        image_name = task.image.name
        mime_type, _ = mimetypes.guess_type(image_name)
        if not mime_type:
            mime_type = 'application/octet-stream'
        try:
            with pathlib.Path(image_path).open('rb') as file_handle:
                response = FileResponse(
                    file_handle,
                    content_type=mime_type,
                )
                quote_filename = quote(pathlib.Path(image_name).name)
                response['Content-Disposition'] = (
                    f"attachment; filename*=UTF-8''{quote_filename}"
                )
                return response
        except FileNotFoundError as err:
            raise Http404('Файл не найден') from err


def checklist_progress_view(request, task_id):
    task = get_object_or_404(Task, pk=task_id)
    progress_data = get_checklist_progress(task)

    html = render_to_string(
        'tasks/_checklist_progress.html',
        progress_data,
    )
    return HttpResponse(html)


class CommentCreateView(LoginRequiredMixin, View):
    def post(self, request: HttpRequest, slug: str) -> HttpResponse:
        success, message, comment = create_comment(slug, request)
        return self._handle_comment_response(
            success=success,
            message=message,
            comment=comment,
            task_slug=slug,
            request=request,
        )

    def _handle_comment_response(
        self,
        *,
        success: bool,
        message: str,
        comment,
        task_slug: str,
        request: HttpRequest,
    ) -> HttpResponse:
        if success:
            response = comments_list_view(request, task_slug)
            if comment:
                self._add_comments_count_trigger(response, comment)
            return response
        return self._create_error_response(message)

    def _add_comments_count_trigger(
        self, response: HttpResponse, comment
    ) -> None:
        comments_count = comment.task.comments.filter(is_deleted=False).count()
        response['HX-Trigger'] = json.dumps({
            'updateCommentsCount': {'count': comments_count}
        })

    def _create_error_response(self, message: str) -> HttpResponse:
        status = HTTP_FORBIDDEN if 'прав' in message else HTTP_BAD_REQUEST
        return HttpResponse(
            f'<div class="notification is-danger">{message}</div>',
            status=status,
        )


class CommentUpdateView(LoginRequiredMixin, View):
    def post(self, request: HttpRequest, comment_id: int) -> HttpResponse:
        success, message, comment = update_comment(comment_id, request)
        return self._handle_comment_update_response(
            success=success, message=message, comment=comment, request=request
        )

    def _handle_comment_update_response(
        self, *, success: bool, message: str, comment, request: HttpRequest
    ) -> HttpResponse:
        if success:
            response = comments_list_view(request, comment.task.slug)
            self._add_comments_count_trigger(response, comment)
            return response
        return self._create_error_response(message)

    def _add_comments_count_trigger(
        self, response: HttpResponse, comment
    ) -> None:
        comments_count = comment.task.comments.filter(is_deleted=False).count()
        response['HX-Trigger'] = json.dumps({
            'updateCommentsCount': {'count': comments_count}
        })

    def _create_error_response(self, message: str) -> HttpResponse:
        status = HTTP_FORBIDDEN if 'прав' in message else HTTP_BAD_REQUEST
        return HttpResponse(
            f'<div class="notification is-danger">{message}</div>',
            status=status,
        )


class CommentDeleteView(LoginRequiredMixin, View):
    def post(self, request: HttpRequest, comment_id: int) -> HttpResponse:
        success, message = delete_comment(comment_id, request)
        return self._handle_comment_delete_response(
            success=success,
            message=message,
            comment_id=comment_id,
            request=request,
        )

    def _handle_comment_delete_response(
        self,
        *,
        success: bool,
        message: str,
        comment_id: int,
        request: HttpRequest,
    ) -> HttpResponse:
        if success:
            return self._process_successful_deletion(comment_id, request)
        return self._create_error_response(message)

    def _process_successful_deletion(
        self, comment_id: int, request: HttpRequest
    ) -> HttpResponse:
        comment = get_object_or_404(Comment, id=comment_id)
        task_slug = comment.task.slug
        comment.soft_delete()

        response = comments_list_view(request, task_slug)
        self._add_comments_count_trigger(response, comment)
        return response

    def _add_comments_count_trigger(
        self, response: HttpResponse, comment
    ) -> None:
        comments_count = comment.task.comments.filter(is_deleted=False).count()
        response['HX-Trigger'] = json.dumps({
            'updateCommentsCount': {'count': comments_count}
        })

    def _create_error_response(self, message: str) -> HttpResponse:
        return HttpResponse(
            f'<div class="notification is-danger">{message}</div>',
            status=HTTP_FORBIDDEN,
        )


class CommentEditFormView(LoginRequiredMixin, View):
    def get(self, request: HttpRequest, comment_id: int) -> HttpResponse:
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
    def get(self, request: HttpRequest, comment_id: int) -> HttpResponse:
        comment = get_object_or_404(Comment, id=comment_id)
        return render(request, 'tasks/_comment.html', {'comment': comment})


def comments_list_view(request: HttpRequest, slug: str) -> HttpResponse:
    context = get_comments_for_task(slug, request)
    return render(request, 'tasks/_comments_container.html', context)
