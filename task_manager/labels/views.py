from typing import Any
from django.contrib import messages
from django.contrib.auth.mixins import LoginRequiredMixin, AccessMixin
from django.contrib.messages.views import SuccessMessageMixin
from django.db.models.base import Model as Model
from django.db.models.query import QuerySet
from django.shortcuts import redirect
from django.urls import reverse_lazy
from django.utils.translation import gettext, gettext_lazy
from django.views.generic import (
    ListView,
    CreateView,
    UpdateView,
    DeleteView,
    FormView,
)

from task_manager.labels.forms import LabelForm
from task_manager.mixins import HandleNoPermissionMixin
from task_manager.labels.models import Label


class LabelsList(LoginRequiredMixin, ListView):
    model = Label
    template_name = 'labels/list_labels.html'
    context_object_name = 'labels'
    error_message = gettext_lazy(
        'У вас нет прав на просмотр данной страницы! Авторизуйтесь!'
    )
    no_permission_url = 'login'


class CreateLabel(LoginRequiredMixin, SuccessMessageMixin, CreateView):
    model = Label
    template_name = 'labels/create_label.html'
    form_class = LabelForm
    success_message = gettext_lazy('Метка успешно создана')
    success_url = reverse_lazy('labels:list')
    error_message = gettext_lazy(
        'У вас нет прав на просмотр данной страницы! Авторизуйтесь!'
    )
    no_permission_url = 'login'


class UpdateLabel(
    LoginRequiredMixin,
    SuccessMessageMixin,
    UpdateView,
):
    model = Label
    template_name = 'labels/update_label.html'
    form_class = LabelForm
    success_message = gettext('Метка успешно изменена')
    success_url = reverse_lazy('labels:list')
    error_message = gettext_lazy('У вас нет разрешения на изменение метки')
    no_permission_url = 'statuses:list'


class DeleteLabel(LoginRequiredMixin, SuccessMessageMixin, DeleteView):
    model = Label
    template_name = 'labels/delete_label.html'
    success_url = reverse_lazy('labels:list')
    success_message = gettext_lazy('Метка успешно удалена')

    def object(self):
        return self.get_object

    def form_valid(self, form):
        if self.get_object().tasks.all():
            messages.error(
                self.request,
                gettext_lazy(
                    'Вы не можете удалить метку, потому что она используется'
                ),
            )
        else:
            self.object.delete()
            messages.success(self.request, self.success_message)
        return redirect(self.success_url)
