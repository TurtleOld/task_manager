"""
Django views for the labels app.

This module contains all view classes and functions for label management,
including label CRUD operations, statistics, and permission handling.

The views are organized into several categories:
- Label management views (CRUD operations)
- Statistics and analytics views
- Permission and authorization views

All views follow Django best practices and include proper authentication,
authorization, and error handling.
"""

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

# Constants
DAYS_IN_MONTH = 30


class LabelsList(LoginRequiredMixin, ListView[Label]):
    """
    View for displaying a list of labels with statistics.

    This view displays all labels in the system along with statistical
    information including active labels count and recently created labels.
    It requires user authentication and provides comprehensive label
    management capabilities.

    Attributes:
        model: The Label model to display
        template_name: Template for rendering the labels list
        context_object_name: Name for the labels in template context
        error_message: Message shown when user lacks permissions
        no_permission_url: URL to redirect unauthorized users
    """

    model = Label
    template_name = 'labels/list_labels.html'
    context_object_name = 'labels'
    error_message = gettext_lazy(
        'У вас нет прав на просмотр данной страницы! Авторизуйтесь!'
    )
    no_permission_url = 'login'

    def get_context_data(self, **kwargs):
        """
        Get context data including label statistics.

        Extends the parent method to include statistical information
        about labels, including active labels count and recently
        created labels within the last month.

        Args:
            **kwargs: Additional context data

        Returns:
            Dictionary of context data with labels and statistics
        """
        context = super().get_context_data(**kwargs)

        # Get all labels with task counts
        labels = context['labels'].prefetch_related('tasks')

        # Calculate statistics
        active_labels = labels.filter(tasks__isnull=False).distinct().count()

        # Labels created this month
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
    """
    View for creating new labels.

    This view provides a form for creating new labels with proper
    validation and success message handling. It extends Django's
    CreateView to handle label creation with authentication requirements.

    Attributes:
        model: The Label model to create
        template_name: Template for rendering the label creation form
        form_class: Form class for label creation
        success_message: Message shown after successful label creation
        success_url: URL to redirect after successful label creation
        error_message: Message shown when user lacks permissions
        no_permission_url: URL to redirect unauthorized users
    """

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
    """
    View for updating existing labels.

    This view allows authenticated users to update label information
    with proper form validation and success message handling. It
    extends Django's UpdateView to handle label updates.

    Attributes:
        model: The Label model to update
        template_name: Template for rendering the label update form
        form_class: Form class for label updates
        success_message: Message shown after successful label update
        success_url: URL to redirect after successful label update
        error_message: Message shown when user lacks permissions
        no_permission_url: URL to redirect when permission denied
    """

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
    """
    View for deleting labels with protection checks.

    This view handles label deletion with protection against deleting
    labels that are currently in use by tasks. It provides proper
    error handling and user feedback for various deletion scenarios.

    Attributes:
        model: The Label model to delete
        template_name: Template for rendering the label deletion confirmation
        success_url: URL to redirect after successful label deletion
        error_message: Message shown when label cannot be deleted
        success_message: Message shown after successful label deletion
    """

    model = Label
    template_name = 'labels/delete_label.html'
    success_url = reverse_lazy('labels:list')
    error_message = gettext_lazy(
        'Вы не можете удалить метку, потому что она используется'
    )
    success_message = gettext_lazy('Метка успешно удалена')

    def _check_label_deletion_safety(self, label_object) -> None:
        """Check if label can be safely deleted."""
        if label_object.tasks.exists():
            raise PermissionDenied(self.error_message)

    def dispatch(
        self,
        request: HttpRequest,
        *args: Any,
        **kwargs: Any,
    ) -> HttpResponseBase:
        """
        Handle request dispatch with protection checks.

        Overrides the parent dispatch method to check if the label
        can be safely deleted. Prevents deletion of labels that are
        currently associated with tasks.

        Args:
            request: The HTTP request object
            *args: Additional positional arguments
            **kwargs: Additional keyword arguments

        Returns:
            HTTP response after processing the request

        Raises:
            PermissionDenied: If the label is in use and cannot be deleted
        """
        try:
            label_object = self.get_object()
            self._check_label_deletion_safety(label_object)
        except PermissionDenied as error:
            messages.error(request, error.args[0])
            return redirect(self.success_url)
        return super().dispatch(request, *args, **kwargs)
