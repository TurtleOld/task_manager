from typing import Any
from django.core.exceptions import PermissionDenied
from django.contrib import messages
from django.contrib.auth.mixins import LoginRequiredMixin
from django.contrib.messages.views import SuccessMessageMixin
from django.db.models.base import Model as Model

from django.http import HttpRequest
from django.http.response import HttpResponseBase
from django.shortcuts import redirect
from django.urls import reverse_lazy
from django.utils.translation import gettext, gettext_lazy
from django.views.generic import (
    ListView,
    CreateView,
    UpdateView,
    DeleteView,
)

from task_manager.labels.forms import LabelForm
from task_manager.labels.models import Label


class LabelsList(LoginRequiredMixin, ListView[Label]):
    model = Label
    template_name = 'labels/list_labels.html'
    context_object_name = 'labels'
    error_message = gettext_lazy(
        'У вас нет прав на просмотр данной страницы! Авторизуйтесь!'
    )
    no_permission_url = 'login'


class CreateLabel(
    LoginRequiredMixin, SuccessMessageMixin[Any], CreateView[Label, Any]
):
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
    SuccessMessageMixin[Any],
    UpdateView[Label, Any],
):
    model = Label
    template_name = 'labels/update_label.html'
    form_class = LabelForm
    success_message = gettext('Метка успешно изменена')
    success_url = reverse_lazy('labels:list')
    error_message = gettext_lazy('У вас нет разрешения на изменение метки')
    no_permission_url = 'labels:list'


class DeleteLabel(  # type: ignore
    LoginRequiredMixin,
    SuccessMessageMixin[Any],
    DeleteView[Label, Any],
):
    model = Label
    template_name = 'labels/delete_label.html'
    success_url = reverse_lazy('labels:list')
    error_message = gettext_lazy(
        'Вы не можете удалить метку, потому что она используется'
    )
    success_message = gettext_lazy('Метка успешно удалена')

    def dispatch(
        self,
        request: HttpRequest,
        *args: reverse_lazy,
        **kwargs: reverse_lazy,
    ) -> HttpResponseBase:
        try:
            obj = self.get_object()
            if obj.tasks.exists():
                raise PermissionDenied(self.error_message)
        except PermissionDenied as e:
            messages.error(request, e.args[0])
            return redirect(self.success_url)
        return super().dispatch(request, *args, **kwargs)
