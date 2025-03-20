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
    HttpResponseRedirect,
)

from django.contrib import messages
from django.contrib.auth.mixins import LoginRequiredMixin
from django.contrib.messages.views import SuccessMessageMixin
from django.shortcuts import get_object_or_404, redirect, render
from django.urls import reverse_lazy
from django.utils.translation import gettext, gettext_lazy
from django.views import View
from django.views.generic import (
    CreateView,
    DeleteView,
    DetailView,
)
from django_filters.views import FilterView

from task_manager.tasks.forms import TaskForm, TasksFilter
from task_manager.tasks.models import ChecklistItem, Task, Stage
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
        delete_task_base_url = (
            reverse_lazy('tasks:delete_task', args=['0'])
            .replace('0', '')
            .rstrip('/')
        )
        return render(
            request,
            template_name=self.template_name,
            context={
                'stages': stages,
                'delete_task_base_url': delete_task_base_url,
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
            # Получаем данные из тела запроса
            data = json.loads(request.body)
            task_id = data.get('task_id')
            new_stage_id = data.get('new_stage_id')
            if not task_id or not new_stage_id:
                return JsonResponse(
                    {'success': False, 'error': 'Invalid data'}, status=400
                )
            task = get_object_or_404(Task, id=task_id)
            new_stage = get_object_or_404(Stage, id=new_stage_id)

            # Обновляем этап задачи
            task.stage = new_stage
            task.save()

            return JsonResponse({'success': True})
        except Exception as e:
            print(f"Error: {str(e)}")  # Отладочное сообщение
            return JsonResponse({'success': False, 'error': str(e)}, status=400)


class UpdateTaskOrderView(View):

    def post(self, request):
        try:
            data = json.loads(request.body)
            tasks = data.get('tasks', [])
            for task_data in tasks:
                task_id = int(task_data['task_id'])
                stage_id = int(task_data['stage_id'])
                order = int(task_data['order'])

                task = Task.objects.filter(pk=task_id).first()
                if task:
                    task.stage_id = stage_id
                    task.order = order
                    task.save()
                else:
                    raise ValueError(f"Таск с ID {task_id} не найден")

        except Exception as e:
            return JsonResponse({'error': str(e)}, status=400)

        return JsonResponse({'message': 'Задачи успешно обновлены'}, status=200)


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


from django.http import JsonResponse


class DeleteTask(
    LoginRequiredMixin,
    SuccessMessageMixin,
    DeleteView,
):
    model = Task
    template_name = 'tasks/delete_task.html'
    success_url = reverse_lazy('tasks:list')
    success_message = "Задача успешно удалена"

    def delete(self, request, *args, **kwargs):
        task = self.get_object()
        if self.request.user != task.author:
            return JsonResponse(
                {
                    'success': False,
                    'error': 'Вы не можете удалить чужую задачу!',
                },
                status=403,
            )

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

    def post(self, request: HttpRequest, id: int) -> HttpResponse:
        checklist_item = get_object_or_404(ChecklistItem, id=id)
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
