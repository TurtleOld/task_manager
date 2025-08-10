import json
import mimetypes
import os
from typing import Any
from urllib.parse import quote
from django.db import IntegrityError
from django.forms import BaseForm, ModelForm
from django.http import (
    FileResponse,
    Http404,
    HttpRequest,
    HttpResponse,
    JsonResponse,
)
from django.db import transaction
from django.template.loader import render_to_string
from django.utils.translation import gettext_lazy as _
from django.contrib import messages
from django.contrib.auth.mixins import LoginRequiredMixin, UserPassesTestMixin
from django.contrib.messages.views import SuccessMessageMixin
from django.shortcuts import get_object_or_404, redirect, render
from django.urls import reverse_lazy
from django.utils.translation import gettext, gettext_lazy
from django.utils import timezone
from django.views import View
from django.views.generic import (
    CreateView,
    DeleteView,
    DetailView,
    UpdateView,
)
from django_filters.views import FilterView

from task_manager.tasks.forms import TaskForm, TasksFilter
from task_manager.tasks.models import (
    ChecklistItem,
    Task,
    Stage,
    Comment,
    reorder_tasks_in_stage,
    reorder_task_within_stage,
)
from task_manager.tasks.services import notify, slugify_translit
from task_manager.users.models import User
from task_manager.tasks.tasks import (
    send_about_closing_task,
    send_about_opening_task,
    send_message_about_adding_task,
    send_about_deleting_task,
    send_about_moving_task,
)
from task_manager.tasks.forms import CommentForm
from task_manager.tasks.tasks import send_comment_notification


class TasksList(
    LoginRequiredMixin,
    SuccessMessageMixin[Any],
    FilterView[Task],
):
    """Display a filtered list of tasks."""

    model = Task
    template_name = 'tasks/kanban.html'
    context_object_name = 'tasks'
    filterset_class = TasksFilter
    error_message = gettext_lazy(
        'У вас нет прав на просмотр данной страницы! Авторизуйтесь!'
    )
    no_permission_url = reverse_lazy('login')


class KanbanBoard(
    LoginRequiredMixin,
    SuccessMessageMixin[Any],
    FilterView[Task],
):
    """Display tasks in a Kanban board format with label filtering."""

    template_name = 'tasks/kanban.html'

    def get(self, request, *args, **kwargs):
        """Handle GET request to display Kanban board with filtered tasks."""
        from task_manager.labels.models import Label

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
    """Create a new stage for task organization."""

    model = Stage
    template_name = 'tasks/create_stage.html'
    fields = '__all__'
    success_url = reverse_lazy('tasks:list')


class UpdateTaskStageView(View):
    """Handle AJAX requests to update task stage and order."""

    def post(self, request, *args, **kwargs):
        """Update task stage and/or order via AJAX."""
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
                        # Return HTML with messages for AJAX requests
                        if request.headers.get('X-Requested-With') == 'XMLHttpRequest':
                            from django.template.loader import render_to_string

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
    """Handle bulk task order updates via AJAX."""

    def post(self, request):
        """Update multiple task orders in a single request."""
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

                    # Отправляем уведомление только если задача перемещается в другую колонку
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
    """Create a new task with checklist items and notifications."""

    model = Task
    template_name = 'tasks/create_task.html'
    form_class = TaskForm
    success_message = gettext_lazy('Задача успешно создана')
    success_url = reverse_lazy('tasks:list')
    error_message = gettext_lazy(
        'У вас нет прав на просмотр данной страницы! Авторизуйтесь!'
    )
    no_permission_url = reverse_lazy('login')
    query_pk_and_slug = True

    def get_form_kwargs(self) -> dict[str, Any]:
        """Pass request to form for dynamic field population."""
        kwargs = super().get_form_kwargs()
        kwargs['request'] = self.request
        return kwargs

    def form_valid(self, form: TaskForm) -> HttpResponse:
        """Process valid form submission with checklist and notifications."""
        try:
            form.instance.author = User.objects.get(pk=self.request.user.pk)
            task = form.save(commit=False)
            task_name = task.name
            task.slug = slugify_translit(task_name)
            task.stage_id = 1
            task = form.save()
            task_slug = task.slug

            # Parse checklist items from POST data
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
                if description:  # Only add non-empty items
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
    """Update an existing task with checklist items."""

    template_name = 'tasks/update_task.html'
    query_pk_and_slug = True
    form_class = TaskForm
    model = Task
    context_object_name = 'tasks'

    def get_form_kwargs(self) -> dict[str, Any]:
        """Pass request to form for dynamic field population."""
        kwargs = super().get_form_kwargs()
        kwargs['request'] = self.request
        return kwargs

    def get_context_data(self, **kwargs: dict[str, Any]) -> dict[str, Any]:
        """Add checklist data to context for JavaScript processing."""
        context = super().get_context_data(**kwargs)
        form = context['form']
        context['checklist_data'] = json.dumps(form.checklist_data)
        return context

    def form_valid(self, form: TaskForm) -> HttpResponse:
        """Process valid form submission with checklist items."""
        # Parse checklist items from POST data
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
            if description:  # Only add non-empty items
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
    """Delete a task with authorization check and notification."""

    template_name = 'tasks/task_confirm_delete.html'
    model = Task
    success_url = reverse_lazy('tasks:list')
    success_message = 'Задача успешно удалена'
    context_object_name = 'tasks'

    def test_func(self):
        """Check if user is the task author."""
        task = self.get_object()
        return self.request.user == task.author

    def handle_no_permission(self):
        """Handle unauthorized deletion attempts."""
        messages.error(
            self.request,
            'Вы не можете удалить чужую задачу!',
        )
        return redirect(self.success_url)

    def delete(self, request, *args, **kwargs):
        """Delete task and send notification."""
        task = self.get_object()

        task_name = task.name
        send_about_deleting_task.delay(task_name)
        task.delete()

        messages.success(request, self.success_message)

        return redirect(self.success_url)

    def form_invalid(self, form: ModelForm[Task]) -> HttpResponse:
        """Handle invalid form submission."""
        messages.error(
            self.request,
            gettext_lazy('Вы не можете удалить чужую задачу!'),
        )
        return redirect(self.success_url)


class CloseTask(View):
    """Toggle task completion status."""

    model = Task
    template_name = 'tasks/kanban.html'
    form_class = TaskForm
    slug_field = 'slug'
    slug_url_kwarg = 'slug'

    def post(self, request: HttpRequest, slug: str) -> HttpResponse:
        """Toggle task state and send appropriate notifications."""
        task = get_object_or_404(Task, slug=slug)
        task_url = self.request.build_absolute_uri(f'/tasks/{slug}')
        if task.author != request.user or task.executor != request.user:
            messages.error(
                request,
                gettext_lazy('У вас нет прав для изменения состояния этой задачи'),
            )
        else:
            task.state = not task.state
            messages.success(
                request,
                gettext_lazy('Статус задачи изменен.'),
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
    """Display detailed view of a task with checklist progress."""

    model = Task
    template_name = 'tasks/view_task.html'
    context_object_name = 'task'
    error_message = gettext(
        'У вас нет прав на просмотр данной страницы! Авторизуйтесь!'
    )
    no_permission_url = reverse_lazy('login')
    query_pk_and_slug = True

    def get_context_data(self, **kwargs: dict[str, Any]) -> dict[str, Any]:
        """Add task labels, checklist progress and comments to context."""
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

        # Добавляем комментарии с пагинацией
        from django.core.paginator import Paginator

        comments = task.comments.filter(is_deleted=False).order_by('-created_at')
        paginator = Paginator(comments, 10)
        page_number = self.request.GET.get('page')
        page_obj = paginator.get_page(page_number)
        context['comments'] = page_obj

        # Добавляем форму для комментариев
        context['comment_form'] = CommentForm()

        return context


class ChecklistItemToggle(View):
    """Toggle completion status of a checklist item via AJAX."""

    template_name = 'tasks/checklist_item.html'

    def post(self, request: HttpRequest, pk: int) -> HttpResponse:
        """Toggle checklist item completion status."""
        checklist_item = get_object_or_404(ChecklistItem, pk=pk)
        checklist_item.is_completed = not checklist_item.is_completed
        checklist_item.save()
        context = {
            'item': checklist_item,
        }
        return render(request, self.template_name, context)


class DownloadFileView(DetailView[Task]):
    """Download task attachment file."""

    model = Task

    def get(self, request: HttpRequest, *args, **kwargs) -> FileResponse:  # type: ignore
        """Serve task image as downloadable file."""
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
    """Return HTML fragment with checklist progress for AJAX updates."""
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
    """Создание нового комментария к задаче."""

    def post(self, request: HttpRequest, task_slug: str) -> HttpResponse:
        """Создать новый комментарий."""
        task = get_object_or_404(Task, slug=task_slug)

        # Проверяем права доступа
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

            # Отправляем уведомление
            if task.executor and task.executor != request.user:
                send_comment_notification.delay(comment.id)

            # Возвращаем обновленный список комментариев для HTMX
            response = comments_list_view(request, task_slug)

            # Добавляем заголовок с обновленным количеством комментариев
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
    """Редактирование комментария."""

    def post(self, request: HttpRequest, comment_id: int) -> HttpResponse:
        """Обновить комментарий."""
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

            # Возвращаем обновленный список комментариев для HTMX
            task = comment.task
            response = comments_list_view(request, task.slug)

            # Добавляем заголовок с обновленным количеством комментариев
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
    """Удаление комментария."""

    def post(self, request: HttpRequest, comment_id: int) -> HttpResponse:
        """Удалить комментарий."""
        comment = get_object_or_404(Comment, id=comment_id)

        if not comment.can_delete(request.user):
            messages.error(request, 'У вас нет прав для удаления этого комментария.')
            return HttpResponse(status=403)

        comment.soft_delete()

        # Возвращаем обновленный список комментариев для HTMX
        task = comment.task
        response = comments_list_view(request, task.slug)

        # Добавляем заголовок с обновленным количеством комментариев
        comments_count = task.comments.filter(is_deleted=False).count()
        response['HX-Trigger'] = json.dumps(
            {'updateCommentsCount': {'count': comments_count}}
        )

        return response


class CommentEditFormView(LoginRequiredMixin, View):
    """Отображение формы редактирования комментария."""

    def get(self, request: HttpRequest, comment_id: int) -> HttpResponse:
        """Показать форму редактирования."""
        comment = get_object_or_404(Comment, id=comment_id)

        if not comment.can_edit(request.user):
            messages.error(
                request, 'У вас нет прав для редактирования этого комментария.'
            )
            return HttpResponse(status=403)

        # Возвращаем только форму редактирования
        return render(request, 'tasks/_comment_edit_form.html', {'comment': comment})


class CommentViewView(LoginRequiredMixin, View):
    """Отображение комментария."""

    def get(self, request: HttpRequest, comment_id: int) -> HttpResponse:
        """Показать комментарий."""
        comment = get_object_or_404(Comment, id=comment_id)
        return render(request, 'tasks/_comment.html', {'comment': comment})


def comments_list_view(request: HttpRequest, task_slug: str) -> HttpResponse:
    """Отображение списка комментариев с пагинацией."""
    task = get_object_or_404(Task, slug=task_slug)
    comments = task.comments.filter(is_deleted=False).order_by('-created_at')

    # Пагинация
    from django.core.paginator import Paginator

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
