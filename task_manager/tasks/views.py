import os

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
from task_manager.users.bot import bot_admin


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

    def form_valid(self, form):
        form.instance.author = User.objects.get(pk=self.request.user.pk)
        task = form.save()
        task_id = task.pk
        task_name = form.cleaned_data['name']
        task_url = self.request.build_absolute_uri(f'/tasks/{task_id}/')
        bot_admin.send_message(
            chat_id=os.environ.get('CHAT_ID'),
            text=(
                f'Создана новая задача: {task_name}\n'
                f'Перейти к задаче: {task_url}'
            ),
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
        task_name = form.cleaned_data['name']
        task_url = self.request.build_absolute_uri(f'/tasks/{task_id}/')
        bot_admin.send_message(
            chat_id=os.environ.get('CHAT_ID'),
            text=(
                f'Задача {task_name} была изменена!\n'
                f'Посмотреть подробнее: {task_url}'
            ),
        )
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
        if self.request.user != self.get_object().author:
            messages.error(
                self.request,
                gettext_lazy('Вы не можете удалить ' 'чужую задачу!'),
            )
        else:
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
