from django.contrib import messages
from django.contrib.auth.mixins import LoginRequiredMixin, AccessMixin
from django.contrib.messages.views import SuccessMessageMixin
from django.shortcuts import redirect
from django.urls import reverse_lazy
from django.utils.translation import gettext, gettext_lazy
from django.views.generic import ListView, CreateView, UpdateView, DeleteView, \
    TemplateView, DetailView

from tasks.forms import TaskForm
from tasks.models import Task
from users.models import User


class TasksList(LoginRequiredMixin,
                SuccessMessageMixin,
                ListView,
                AccessMixin):
    model = Task
    template_name = 'tasks/list_tasks.html'
    context_object_name = 'tasks'
    error_message = gettext('У вас нет прав на просмотр данной страницы! '
                            'Авторизуйтесь!')
    no_permission_url = reverse_lazy('login')

    def handle_no_permission(self):
        messages.error(self.request, self.error_message)
        return redirect(self.no_permission_url)


class TaskCreate(SuccessMessageMixin, CreateView):
    model = Task
    template_name = 'tasks/create_task.html'
    form_class = TaskForm
    success_message = gettext_lazy('Задача успешно создана!')
    success_url = reverse_lazy('tasks:list')
    error_message = gettext('У вас нет прав на просмотр данной страницы! '
                            'Авторизуйтесь!')
    no_permission_url = reverse_lazy('login')

    def form_valid(self, form):
        form.instance.author = User.objects.get(pk=self.request.user.pk)
        return super().form_valid(form)

    def get_context_data(self, **kwargs):
        context = super(TaskCreate, self).get_context_data(**kwargs)
        context['title'] = gettext('Создание задачи')
        context['button_text'] = gettext('Создать задачу')
        return context

    def handle_no_permission(self):
        messages.error(self.request, self.error_message)
        return redirect(self.no_permission_url)


class TaskUpdate(SuccessMessageMixin, UpdateView):
    model = Task
    template_name = 'tasks/update_task.html'
    form_class = TaskForm
    success_message = gettext_lazy('Задача успешно создана!')
    success_url = reverse_lazy('tasks:list')
    error_message = gettext('У вас нет прав на просмотр данной страницы! '
                            'Авторизуйтесь!')
    no_permission_url = reverse_lazy('login')

    def get_context_data(self, **kwargs):
        context = super(TaskUpdate, self).get_context_data(**kwargs)
        context['title'] = gettext_lazy('Обновление задачи')
        context['button_text'] = gettext_lazy('Обновить задачу')
        return context

    def handle_no_permission(self):
        messages.error(self.request, self.error_message)
        return redirect(self.no_permission_url)


class TaskDelete(LoginRequiredMixin,
                 SuccessMessageMixin, AccessMixin,
                 DeleteView):
    model = Task
    template_name = 'tasks/delete_task.html'
    success_url = reverse_lazy('tasks:list')

    def get_context_data(self, **kwargs):
        context = super(TaskDelete, self).get_context_data(**kwargs)
        context['title'] = gettext_lazy('Удаление задачи')
        context['button_text'] = gettext_lazy('Удалить задачу')
        return context

    def form_valid(self, form):
        if self.request.user != self.get_object().author:
            messages.error(self.request, gettext_lazy('Вы не можете удалить '
                                                      'чужую задачу!'))
        else:
            super(TaskDelete, self).form_valid(form)
        return redirect(self.success_url)


class TaskView(LoginRequiredMixin,
               SuccessMessageMixin, AccessMixin,
               DetailView):
    model = Task
    template_name = 'tasks/view_task.html'
    context_object_name = 'task'
    error_message = gettext('У вас нет прав на просмотр данной страницы! '
                            'Авторизуйтесь!')
    no_permission_url = reverse_lazy('login')

    def handle_no_permission(self):
        messages.error(self.request, self.error_message)
        return redirect(self.no_permission_url)
