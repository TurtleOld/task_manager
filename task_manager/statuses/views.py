from django.contrib import messages
from django.contrib.auth.mixins import LoginRequiredMixin
from django.contrib.messages.views import SuccessMessageMixin
from django.shortcuts import redirect
from django.urls import reverse_lazy
from django.utils.translation import gettext_lazy
from django.views.generic import (
    ListView,
    CreateView,
    UpdateView,
    DeleteView,
)
from django.views.generic.edit import DeletionMixin

from task_manager.statuses.forms import StatusForm
from task_manager.statuses.models import Status


class StatusesList(LoginRequiredMixin, ListView):
    model = Status
    template_name = 'statuses/list_statuses.html'
    context_object_name = 'statuses'
    error_message = gettext_lazy(
        'У вас нет прав на просмотр данной страницы! ' 'Авторизуйтесь!'
    )
    no_permission_url = 'login'


class CreateStatus(
    LoginRequiredMixin,
    SuccessMessageMixin,
    CreateView,
):
    model = Status
    template_name = 'statuses/create_status.html'
    form_class = StatusForm
    success_message = gettext_lazy('Статус успешно создан')
    success_url = reverse_lazy('statuses:list')


class UpdateStatus(
    LoginRequiredMixin,
    SuccessMessageMixin,
    UpdateView,
):
    model = Status
    template_name = 'statuses/update_status.html'
    form_class = StatusForm
    success_url = reverse_lazy('statuses:list')
    success_message = gettext_lazy('Статус успешно изменён')
    error_message = gettext_lazy('У вас нет разрешения на изменение статуса')
    no_permission_url = 'statuses:list'


class DeleteStatus(
    LoginRequiredMixin,
    SuccessMessageMixin,
    DeleteView,
    DeletionMixin,
):
    model = Status
    template_name = 'statuses/delete_status.html'
    success_url = reverse_lazy('statuses:list')
    success_message = gettext_lazy('Статус успешно удалён')
    error_message = gettext_lazy('У вас нет разрешения на изменение статуса')
    no_permission_url = 'statuses:list'

    def form_valid(self, form):
        if self.get_object().tasks.all():
            messages.error(
                self.request,
                gettext_lazy(
                    'Вы не можете удалить '
                    'статус, потому что он '
                    'используется'
                ),
            )
        else:
            self.object.delete()
            messages.success(self.request, self.success_message)
        return redirect(self.success_url)
