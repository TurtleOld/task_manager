from datetime import timedelta
from django.utils.timezone import now

from django.contrib import messages
from django.contrib.auth.mixins import LoginRequiredMixin
from django.contrib.messages.views import SuccessMessageMixin
from django.shortcuts import redirect
from django.urls import reverse_lazy
from django.utils.translation import gettext, gettext_lazy
from django.views.generic import CreateView, UpdateView, DeleteView, DetailView
from django_filters.views import FilterView

from task_manager.tasks.forms import TaskForm, TasksFilter
from task_manager.tasks.models import Task
from task_manager.users.models import User
from task_manager.mixins import HandleNoPermissionMixin
from task_manager.tasks.tasks import (
    send_message_about_adding_task,
    send_message_about_updating_task,
    send_message_about_deleting_task,
    send_message_notification_about_task,
)


class TasksList(
    LoginRequiredMixin, HandleNoPermissionMixin, SuccessMessageMixin, FilterView
):
    model = Task
    template_name = 'tasks/list_tasks.html'
    context_object_name = 'tasks'
    filterset_class = TasksFilter
    error_message = gettext_lazy(
        'У вас нет прав на просмотр данной страницы! ' 'Авторизуйтесь!'
    )
    no_permission_url = reverse_lazy('login')


class CreateTask(SuccessMessageMixin, HandleNoPermissionMixin, CreateView):
    model = Task
    template_name = 'tasks/create_task.html'
    form_class = TaskForm
    success_message = gettext_lazy('Задача успешно создана')
    success_url = reverse_lazy('tasks:list')
    error_message = gettext_lazy(
        'У вас нет прав на просмотр данной страницы! ' 'Авторизуйтесь!'
    )
    no_permission_url = reverse_lazy('login')

    def get_form_kwargs(self):
        kwargs = super().get_form_kwargs()
        kwargs['request'] = self.request
        return kwargs

    def form_valid(self, form):
        form.instance.author = User.objects.get(pk=self.request.user.pk)
        task = form.save()
        task_id = task.pk
        task_name = task.name
        deadline = task.deadline

        task_url = self.request.build_absolute_uri(f'/tasks/{task_id}/')
        send_message_about_adding_task.delay(task_name, task_url)
        notify_time_hour = task.deadline - timedelta(hours=1)
        notify_time_day = task.deadline - timedelta(days=1)

        if deadline and notify_time_hour > now():
            send_message_notification_about_task.apply_async(
                (task_name,),
                eta=notify_time_hour,
            )
        if deadline and notify_time_day > now():
            send_message_notification_about_task.apply_async(
                (task_name,),
                eta=notify_time_day,
            )
        return super().form_valid(form)


class UpdateTask(SuccessMessageMixin, HandleNoPermissionMixin, UpdateView):
    model = Task
    template_name = 'tasks/update_task.html'
    form_class = TaskForm
    success_message = gettext_lazy('Задача успешно изменена')
    success_url = reverse_lazy('tasks:list')
    error_message = gettext_lazy(
        'У вас нет прав на просмотр данной страницы! ' 'Авторизуйтесь!'
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

        if deadline:
            notify_time_hour = task.deadline - timedelta(hours=1)
            notify_time_day = task.deadline - timedelta(days=1)
            if deadline and notify_time_hour > now():
                send_message_notification_about_task.apply_async(
                    (task_name,),
                    eta=notify_time_hour,
                )
            if deadline and notify_time_day > now():
                send_message_notification_about_task.apply_async(
                    (task_name,),
                    eta=notify_time_day,
                )
        task_url = self.request.build_absolute_uri(f'/tasks/{task_id}/')
        send_message_about_updating_task.delay(task_name, task_url)
        return super().form_valid(form)


class DeleteTask(
    LoginRequiredMixin, SuccessMessageMixin, HandleNoPermissionMixin, DeleteView
):
    model = Task
    template_name = 'tasks/delete_task.html'
    success_url = reverse_lazy('tasks:list')
    success_message = gettext_lazy('Задача успешно удалена')
    error_message = gettext_lazy(
        'У вас нет прав на просмотр данной страницы! ' 'Авторизуйтесь!'
    )
    no_permission_url = reverse_lazy('login')

    def form_valid(self, form):
        task = self.get_object()
        if self.request.user != self.get_object().author:
            messages.error(
                self.request,
                gettext_lazy('Вы не можете удалить ' 'чужую задачу!'),
            )
        else:
            task_name = task.name
            send_message_about_deleting_task.delay(task_name)
            self.object.delete()
            messages.success(self.request, self.success_message)
        return redirect(self.success_url)


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
        context['labels'] = self.get_object().labels.all()
        return context
