from datetime import timedelta
import mimetypes
import os
from urllib.parse import quote
from django.http import (
    FileResponse,
    Http404,
)
from django.utils.timezone import now

from django.contrib import messages
from django.contrib.auth.mixins import LoginRequiredMixin
from django.contrib.messages.views import SuccessMessageMixin
from django.shortcuts import get_object_or_404, redirect, render
from django.urls import reverse_lazy
from django.utils.translation import gettext, gettext_lazy
from django.views import View
from django.views.generic import (
    CreateView,
    UpdateView,
    DeleteView,
    DetailView,
)
from django_filters.views import FilterView

from task_manager.tasks.forms import TaskForm, TasksFilter
from task_manager.tasks.models import ChecklistItem, Task
from task_manager.users.models import User
from task_manager.mixins import HandleNoPermissionMixin
from task_manager.tasks.tasks import (
    send_about_closing_task,
    send_about_opening_task,
    send_message_about_adding_task,
    send_about_updating_task,
    send_about_deleting_task,
    send_notification_about_task,
)


class TasksList(
    LoginRequiredMixin,
    HandleNoPermissionMixin,
    SuccessMessageMixin,
    FilterView,
):
    model = Task
    template_name = 'tasks/list_tasks.html'
    context_object_name = 'tasks'
    filterset_class = TasksFilter
    error_message = gettext_lazy(
        'У вас нет прав на просмотр данной страницы! Авторизуйтесь!'
    )
    no_permission_url = reverse_lazy('login')


class CreateTask(SuccessMessageMixin, HandleNoPermissionMixin, CreateView):
    model = Task
    template_name = 'tasks/create_task.html'
    form_class = TaskForm
    success_message = gettext_lazy('Задача успешно создана')
    success_url = reverse_lazy('tasks:list')
    error_message = gettext_lazy(
        'У вас нет прав на просмотр данной страницы! Авторизуйтесь!'
    )
    no_permission_url = reverse_lazy('login')

    def get_form_kwargs(self):
        kwargs = super().get_form_kwargs()
        kwargs['request'] = self.request
        return kwargs

    def form_valid(self, form):
        form.instance.author = User.objects.get(pk=self.request.user.pk)
        task = form.save()
        form.save_checklist_items(task)
        task_id = task.pk
        task_name = task.name
        deadline = task.deadline
        reminder_periods = form.cleaned_data['reminder_periods']
        task_url = self.request.build_absolute_uri(f'/tasks/{task_id}/')
        send_message_about_adding_task.delay(task_name, task_url)
        if deadline and reminder_periods:
            for period in reminder_periods:
                notify_time_hour = task.deadline - timedelta(
                    minutes=period.period
                )
                if notify_time_hour > now():
                    send_notification_about_task.apply_async(
                        (
                            task_name,
                            f'{period}',
                        ),
                        eta=notify_time_hour,
                    )
        return super().form_valid(form)


class UpdateTask(SuccessMessageMixin, HandleNoPermissionMixin, UpdateView):
    model = Task
    template_name = 'tasks/update_task.html'
    form_class = TaskForm
    success_message = gettext_lazy('Задача успешно изменена')
    success_url = reverse_lazy('tasks:list')
    error_message = gettext_lazy(
        'У вас нет прав на просмотр данной страницы! Авторизуйтесь!'
    )
    no_permission_url = reverse_lazy('login')

    def get_form_kwargs(self):
        kwargs = super().get_form_kwargs()
        kwargs['request'] = self.request
        return kwargs

    def form_valid(self, form):
        task = form.save()
        task_id = task.pk
        task_name = task.name
        deadline = task.deadline
        reminder_periods = form.cleaned_data['reminder_periods']

        if deadline and reminder_periods:
            for period in reminder_periods:
                notify_time_hour = task.deadline - timedelta(
                    minutes=period.period
                )
                if notify_time_hour > now():
                    send_notification_about_task.apply_async(
                        (
                            task_name,
                            f'{period}',
                        ),
                        eta=notify_time_hour,
                    )
        task_url = self.request.build_absolute_uri(f'/tasks/{task_id}/')
        send_about_updating_task.delay(task_name, task_url)
        return super().form_valid(form)


class DeleteTask(
    LoginRequiredMixin, SuccessMessageMixin, HandleNoPermissionMixin, DeleteView
):
    model = Task
    template_name = 'tasks/delete_task.html'
    success_url = reverse_lazy('tasks:list')
    success_message = gettext_lazy('Задача успешно удалена')
    error_message = gettext_lazy(
        'У вас нет прав на просмотр данной страницы! Авторизуйтесь!'
    )
    no_permission_url = reverse_lazy('login')

    def form_valid(self, form):
        task = self.get_object()
        if self.request.user != self.get_object().author:
            messages.error(
                self.request,
                gettext_lazy('Вы не можете удалить чужую задачу!'),
            )
        else:
            task_name = task.name
            send_about_deleting_task.delay(task_name)
            self.object.delete()
            messages.success(self.request, self.success_message)
        return redirect(self.success_url)


class CloseTask(View):
    model = Task
    template_name = 'tasks/list_tasks.html'
    form_class = TaskForm

    def post(self, request, pk):
        task = get_object_or_404(Task, id=pk)
        task_id = task.id
        task_url = self.request.build_absolute_uri(f'/tasks/{task_id}/')

        if task.author != request.user or task.executor != request.user:
            messages.error(
                request,
                gettext_lazy(
                    'У вас нет прав для изменения состояния этой задачи'
                ),
            )

        else:
            task.state = not task.state
            task.save()
            messages.success(
                request,
                gettext_lazy('Состояние задачи изменено'),
            )
            if task.state:
                send_about_closing_task.delay(task.name, task_url)
            else:
                send_about_opening_task.delay(task.name, task_url)

        return redirect('tasks:list')


class TaskView(
    LoginRequiredMixin, SuccessMessageMixin, HandleNoPermissionMixin, DetailView
):
    model = Task
    template_name = 'tasks/view_task.html'
    context_object_name = 'task'
    error_message = gettext(
        'У вас нет прав на просмотр данной страницы! ' 'Авторизуйтесь!'
    )
    no_permission_url = reverse_lazy('login')

    def get_context_data(self, **kwargs):
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

    def post(self, request, item_id):
        checklist_item = get_object_or_404(ChecklistItem, id=item_id)
        checklist_item.is_completed = not checklist_item.is_completed
        checklist_item.save()

        context = {
            'item': checklist_item,
        }
        return render(request, self.template_name, context)


class DownloadFileView(DetailView):
    model = Task

    def get(self, request, pk):
        task = self.get_object()
        file_path = task.files.path
        file_name = task.files.name
        mime_type, _ = mimetypes.guess_type(file_name)
        if not mime_type:
            mime_type = 'application/octet-stream'
        try:
            response = FileResponse(
                open(file_path, 'rb'),
                content_type=mime_type,
            )
            quote_filename = quote(os.path.basename(file_name))
            response['Content-Disposition'] = (
                f"attachment; filename*=UTF-8''{quote_filename}"
            )
            return response
        except FileNotFoundError:
            raise Http404("Файл не найден")
