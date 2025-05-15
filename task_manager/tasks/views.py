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

from django.contrib import messages
from django.contrib.auth.mixins import LoginRequiredMixin, UserPassesTestMixin
from django.contrib.messages.views import SuccessMessageMixin
from django.shortcuts import get_object_or_404, redirect, render
from django.urls import reverse_lazy
from django.utils.translation import gettext, gettext_lazy
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
)


class TasksList(
    LoginRequiredMixin,
    SuccessMessageMixin[Any],
    FilterView[Task],
):
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
    template_name = 'tasks/kanban.html'

    def get(self, request, *args, **kwargs):
        stages = Stage.objects.prefetch_related('tasks').order_by('order')

        # Преобразуем задачи в JSON-совместимый формат
        tasks_data = []
        for stage in stages:
            for task in stage.tasks.all():
                tasks_data.append(
                    {
                        'id': task.id,
                        'name': task.name,
                        'slug': task.slug,
                        'author': {
                            'username': (
                                task.author.username if task.author else ''
                            ),
                            'full_name': (
                                task.author.get_full_name()
                                if task.author
                                else ''
                            ),
                        },
                        'executor': {
                            'username': (
                                task.executor.username if task.executor else ''
                            ),
                            'full_name': (
                                task.executor.get_full_name()
                                if task.executor
                                else ''
                            ),
                        },
                        'created_at': task.created_at.strftime(
                            '%d.%m.%Y %H:%M'
                        ),
                        'stage': task.stage_id,
                    }
                )

        return render(
            request,
            template_name=self.template_name,
            context={
                'stages': stages,
                'tasks': json.dumps(tasks_data, default=str),
            },
        )


class CreateStageView(LoginRequiredMixin, SuccessMessageMixin, CreateView):
    model = Stage
    template_name = 'tasks/create_stage.html'
    fields = '__all__'
    success_url = reverse_lazy('tasks:list')


class UpdateTaskStageView(View):
    def post(self, request, *args, **kwargs):
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
                        Stage.objects.get(id=new_stage_id)
                        if new_stage_id
                        else None
                    )
                    task.stage = new_stage
                    task.save()

                    if old_stage:
                        reorder_tasks_in_stage(old_stage.id)
                    if new_stage:
                        reorder_tasks_in_stage(new_stage.id)

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
    def post(self, request):
        try:
            data = json.loads(request.body)
            tasks_data = data.get('tasks', [])

            for task_data in tasks_data:
                task_id = task_data.get('task_id')
                stage_id = task_data.get('stage_id')
                order = task_data.get('order')

                if task_id is None or stage_id is None or order is None:
                    raise ValueError("Invalid task data")

                task = Task.objects.filter(pk=task_id).first()
                if task:
                    task.stage_id = stage_id
                    task.order = order
                    task.save()
                else:
                    raise ValueError(f"Task with ID {task_id} not found")

            return JsonResponse(
                {'message': 'Tasks successfully updated'}, status=200
            )

        except Exception as e:
            return JsonResponse({'error': str(e)}, status=400)


class CreateTask(
    LoginRequiredMixin,
    SuccessMessageMixin[Any],
    CreateView[Task, Any],
):
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
        kwargs = super().get_form_kwargs()
        kwargs['request'] = self.request
        return kwargs

    def form_valid(self, form: TaskForm) -> HttpResponse:
        try:
            form.instance.author = User.objects.get(pk=self.request.user.pk)
            task = form.save(commit=False)
            task_name = task.name
            task.slug = slugify_translit(task_name)
            task.stage_id = 1
            task = form.save()
            task_slug = task.slug
            form.save_checklist_items(task)
            task_image = task.image
            deadline = task.deadline
            reminder_periods = form.cleaned_data['reminder_periods']
            task_url = self.request.build_absolute_uri(f'/tasks/{task_slug}')
            send_message_about_adding_task.delay(task_name, task_url)
            task_image_path = task.image.path if task_image else None
            if (
                deadline
                and reminder_periods
                and os.environ.get('TOKEN_TELEGRAM_BOT')
            ):
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
    template_name = 'tasks/update_task.html'
    query_pk_and_slug = True
    form_class = TaskForm
    model = Task
    context_object_name = 'tasks'

    def get_form_kwargs(self) -> dict[str, Any]:
        kwargs = super().get_form_kwargs()
        kwargs['request'] = self.request
        return kwargs


class DeleteTask(
    LoginRequiredMixin,
    SuccessMessageMixin,
    UserPassesTestMixin,
    DeleteView,
):
    template_name = 'tasks/task_confirm_delete.html'
    model = Task
    success_url = reverse_lazy('tasks:list')
    success_message = "Задача успешно удалена"
    context_object_name = 'tasks'

    def test_func(self):
        task = self.get_object()
        return self.request.user == task.author

    def handle_no_permission(self):
        messages.error(
            self.request,
            'Вы не можете удалить чужую задачу!',
        )
        return redirect(self.success_url)

    def delete(self, request, *args, **kwargs):
        task = self.get_object()

        task_name = task.name
        send_about_deleting_task.delay(task_name)
        task.delete()

        messages.success(request, self.success_message)

        return redirect(self.success_url)

    def form_invalid(self, form: ModelForm[Task]) -> HttpResponse:
        messages.error(
            self.request,
            gettext_lazy('Вы не можете удалить чужую задачу!'),
        )
        return redirect(self.success_url)


class CloseTask(View):
    model = Task
    template_name = 'tasks/kanban.html'
    form_class = TaskForm
    slug_field = 'slug'
    slug_url_kwarg = 'slug'

    def post(self, request: HttpRequest, slug: str) -> HttpResponse:
        task = get_object_or_404(Task, slug=slug)
        task_url = self.request.build_absolute_uri(f'/tasks/{slug}')
        if task.author != request.user or task.executor != request.user:
            messages.error(
                request,
                gettext_lazy(
                    'У вас нет прав для изменения состояния этой задачи'
                ),
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
    model = Task
    template_name = 'tasks/view_task.html'
    context_object_name = 'task'
    error_message = gettext(
        'У вас нет прав на просмотр данной страницы! Авторизуйтесь!'
    )
    no_permission_url = reverse_lazy('login')
    query_pk_and_slug = True

    def get_context_data(self, **kwargs: dict[str, Any]) -> dict[str, Any]:
        context = super().get_context_data(**kwargs)
        task = self.get_object()
        context['labels'] = self.get_object().labels.all()

        if hasattr(task, 'checklist'):
            context['checklist_items'] = task.checklist.items.all()
        else:
            context['checklist_items'] = []
        return context


class ChecklistItemToggle(View):
    template_name = 'tasks/checklist_item.html'

    def post(self, request: HttpRequest, pk: int) -> HttpResponse:
        checklist_item = get_object_or_404(ChecklistItem, pk=pk)
        checklist_item.is_completed = not checklist_item.is_completed
        checklist_item.save()
        context = {
            'item': checklist_item,
        }
        return render(request, self.template_name, context)


class DownloadFileView(DetailView[Task]):
    model = Task

    def get(self, request: HttpRequest, *args, **kwargs) -> FileResponse:  # type: ignore
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
