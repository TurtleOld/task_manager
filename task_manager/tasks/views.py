from datetime import timedelta
import mimetypes
import os
from typing import Any
from urllib.parse import quote
from django.db import IntegrityError
from django.http import (
    FileResponse,
    Http404,
    HttpRequest,
    HttpResponse,
)
from django.utils.text import slugify
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
from transliterate import translit

from task_manager.statuses.models import Status
from task_manager.tasks.forms import TaskForm, TasksFilter
from task_manager.tasks.models import ChecklistItem, Task
from task_manager.users.models import User
from task_manager.tasks.tasks import (
    send_about_closing_task,
    send_about_opening_task,
    send_message_about_adding_task,
    send_about_updating_task,
    send_about_deleting_task,
    send_notification_about_task,
    send_notification_with_photo_about_task,
)


class TasksList(
    LoginRequiredMixin,
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


class CreateTask(LoginRequiredMixin, SuccessMessageMixin, CreateView):
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

    def get_form_kwargs(self):
        kwargs = super().get_form_kwargs()
        kwargs['request'] = self.request
        return kwargs

    def form_valid(self, form):
        try:
            form.instance.author = User.objects.get(pk=self.request.user.pk)
            task = form.save(commit=False)
            task_name = task.name
            translite_name = translit(
                task_name, language_code='ru', reversed=True
            )
            task.slug = slugify(translite_name, allow_unicode=True)
            task.status = Status.objects.get_or_create(name='Новая')[0]
            task = form.save()
            task_slug = task.slug
            form.save_checklist_items(task)
            task_image = task.image
            deadline = task.deadline
            reminder_periods = form.cleaned_data['reminder_periods']
            task_url = self.request.build_absolute_uri(f'/tasks/{task_slug}')
            send_message_about_adding_task.delay(task_name, task_url)
            task_file_path = task.image.path if task_image else None

            if deadline and reminder_periods:
                for period in reminder_periods:
                    notify_time = task.deadline - timedelta(
                        minutes=period.period
                    )
                    if notify_time > now():
                        if task_file_path:
                            send_notification_with_photo_about_task.apply_async(
                                (
                                    task_name,
                                    f'{period}',
                                    task_url,
                                    task_file_path,
                                ),
                                eta=notify_time,
                            )
                        else:
                            send_notification_about_task.apply_async(
                                (
                                    task_name,
                                    f'{period}',
                                    task_url,
                                ),
                                eta=notify_time,
                            )
            return super().form_valid(form)
        except IntegrityError:
            messages.error(
                self.request,
                'Задача с таким названием уже существует.',
            )
            return self.form_invalid(form)


class UpdateTask(LoginRequiredMixin, SuccessMessageMixin, UpdateView):
    model = Task
    template_name = 'tasks/update_task.html'
    form_class = TaskForm
    success_message = gettext_lazy('Задача успешно изменена')
    success_url = reverse_lazy('tasks:list')
    error_message = gettext_lazy(
        'У вас нет прав на просмотр данной страницы! Авторизуйтесь!'
    )
    no_permission_url = reverse_lazy('login')
    query_pk_and_slug = True
    slug_field = 'slug'
    slug_url_kwarg = 'slug'

    def get_form_kwargs(self):
        kwargs = super().get_form_kwargs()
        kwargs['request'] = self.request
        return kwargs

    def form_valid(self, form):
        task = form.save(commit=False)
        task_name = task.name
        translite_name = translit(task_name, language_code='ru', reversed=True)
        task.slug = slugify(translite_name, allow_unicode=True)
        task = form.save()
        task_slug = task.slug
        deadline = task.deadline
        reminder_periods = form.cleaned_data['reminder_periods']
        task_url = self.request.build_absolute_uri(f'/tasks/{task_slug}')
        task_image_path = task.image.path if task.image else None
        if deadline and reminder_periods:

            for period in reminder_periods:
                notify_time = task.deadline - timedelta(minutes=period.period)
                if notify_time > now():
                    if task_image_path:
                        send_notification_with_photo_about_task.apply_async(
                            (
                                task_name,
                                f'{period}',
                                task_url,
                                task_image_path,
                            ),
                            eta=notify_time,
                        )
                    else:
                        send_notification_about_task.apply_async(
                            (
                                task_name,
                                f'{period}',
                                task_url,
                            ),
                            eta=notify_time,
                        )

        send_about_updating_task.delay(task_name, task_url)
        return super().form_valid(form)


class DeleteTask(
    LoginRequiredMixin,
    SuccessMessageMixin,
    DeleteView,
):
    model = Task
    template_name = 'tasks/delete_task.html'
    success_url = reverse_lazy('tasks:list')
    success_message = gettext_lazy('Задача успешно удалена')
    error_message = gettext_lazy(
        'У вас нет прав на просмотр данной страницы! Авторизуйтесь!'
    )
    no_permission_url = reverse_lazy('login')
    slug_field = 'slug'
    slug_url_kwarg = 'slug'

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
                gettext_lazy('Состояние задачи изменено'),
            )
            if task.state:
                send_about_closing_task.delay(task.name, task_url)
                task.status = Status.objects.get_or_create(name='Закрыта')[0]
                task.save()
            else:
                send_about_opening_task.delay(task.name, task_url)
                task.status = Status.objects.get_or_create(
                    name='Открыта заново'
                )[0]
                task.save()

        return redirect('tasks:list')


class TaskView(
    LoginRequiredMixin,
    SuccessMessageMixin,
    DetailView,
):
    model = Task
    template_name = 'tasks/view_task.html'
    context_object_name = 'task'
    error_message = gettext(
        'У вас нет прав на просмотр данной страницы! Авторизуйтесь!'
    )
    no_permission_url = reverse_lazy('login')
    query_pk_and_slug = True

    def get_context_data(self, **kwargs) -> dict[str, Any]:
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

    def post(self, request: HttpRequest, item_id: int):
        checklist_item = get_object_or_404(ChecklistItem, id=item_id)
        checklist_item.is_completed = not checklist_item.is_completed
        checklist_item.save()

        context = {
            'item': checklist_item,
        }
        return render(request, self.template_name, context)


class DownloadFileView(DetailView):
    model = Task

    def get(self, request: HttpRequest, *args, **kwargs) -> HttpResponse:
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
            raise Http404("Файл не найден")
