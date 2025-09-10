
import datetime as dt
from typing import Any

from django.contrib import messages
from django.contrib.auth.mixins import LoginRequiredMixin
from django.contrib.messages.views import SuccessMessageMixin
from django.core.exceptions import PermissionDenied
from django.http import HttpRequest
from django.http.response import HttpResponseBase
from django.shortcuts import redirect
from django.urls import reverse_lazy
from django.utils import timezone
from django.utils.translation import gettext, gettext_lazy
from django.views.generic import (
    CreateView,
    DeleteView,
    ListView,
    UpdateView,
)

from task_manager.labels.forms import LabelForm
from task_manager.labels.models import Label

DAYS_IN_MONTH = 30


class LabelsList(LoginRequiredMixin, ListView[Label]):

    model = Label
    template_name = 'labels/list_labels.html'
    context_object_name = 'labels'
    error_message = gettext_lazy(
        'У вас нет прав на просмотр данной страницы! Авторизуйтесь!'
    )
    no_permission_url = 'login'

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)

        labels = context['labels'].prefetch_related('tasks')

        active_labels = labels.filter(tasks__isnull=False).distinct().count()

        month_ago = timezone.now() - dt.timedelta(days=DAYS_IN_MONTH)
        recent_labels = labels.filter(created_at__gte=month_ago).count()

        context.update({
            'active_labels_count': active_labels,
            'recent_labels_count': recent_labels,
        })

        return context


class CreateLabel(
    LoginRequiredMixin, SuccessMessageMixin, CreateView[Label, Any]
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
    SuccessMessageMixin,
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
    SuccessMessageMixin,
    DeleteView[Label, Any],
):

    model = Label
    template_name = 'labels/delete_label.html'
    success_url = reverse_lazy('labels:list')
    error_message = gettext_lazy(
        'Вы не можете удалить метку, потому что она используется'
    )
    success_message = gettext_lazy('Метка успешно удалена')

    def _check_label_deletion_permission(self, label_object: Label) -> None:
        if label_object.tasks.exists():
            raise PermissionDenied(self.error_message)

    def dispatch(
        self,
        request: HttpRequest,
        *args: Any,
        **kwargs: Any,
    ) -> HttpResponseBase:
        try:
            label_object = self.get_object()
            self._check_label_deletion_permission(label_object)
        except PermissionDenied as error:
            messages.error(request, error.args[0])
            return redirect(self.success_url)
        return super().dispatch(request, *args, **kwargs)
