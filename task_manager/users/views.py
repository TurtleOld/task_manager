"""
Django views for the users app.

This module contains all view classes and functions for user management,
including authentication, registration,
profile management, and theme customization.

The views are organized into several categories:
- Authentication views (login, logout, registration)
- Profile management views (view, update, delete)
- Theme customization views (mode switching, color updates)

All views follow Django best practices and include proper authentication,
authorization, and error handling.
"""

import json
from typing import Any

from django.contrib import messages
from django.contrib.auth.mixins import LoginRequiredMixin
from django.contrib.auth.views import LoginView, LogoutView
from django.contrib.messages.views import SuccessMessageMixin
from django.core.exceptions import PermissionDenied
from django.db.models import ProtectedError
from django.forms import ModelForm
from django.http import (
    HttpRequest,
    HttpResponse,
    HttpResponseRedirect,
    JsonResponse,
)
from django.shortcuts import redirect
from django.urls import reverse_lazy
from django.utils.decorators import method_decorator
from django.utils.translation import gettext, gettext_lazy
from django.views.decorators.csrf import csrf_exempt
from django.views.generic import TemplateView
from django.views.generic.edit import (
    CreateView,
    DeleteView,
    UpdateView,
)
from django_stubs_ext import StrPromise

from task_manager.constants import VALID_THEME_COLORS
from task_manager.users.forms import AuthUserForm, RegisterUserForm
from task_manager.users.models import User


class IndexView(TemplateView):
    """
    Index view for redirecting users based on authentication status.

    This view redirects authenticated users to the task list and
    unauthenticated users to the login page. It serves as the main
    entry point for the application.

    Attributes:
        template_name: Not used as this view always redirects
    """

    def dispatch(self, request, *args, **kwargs):
        """
        Handle request dispatch with authentication-based redirects.

        Redirects authenticated users to the task list and
        unauthenticated users to the login page.

        Args:
            request: The HTTP request object
            *args: Additional positional arguments
            **kwargs: Additional keyword arguments

        Returns:
            Redirect response to appropriate page based on authentication
        """
        if request.user.is_authenticated:
            return redirect('tasks:list')
        return redirect('login')


class ProfileUser(LoginRequiredMixin, TemplateView):
    """
    View for displaying user profile information.

    This view displays the current user's profile information in a
    template. It requires user authentication and provides access
    to user data in the template context.

    Attributes:
        template_name: Template for rendering the user profile
    """

    template_name = 'users/profile.html'

    def get_context_data(self, **kwargs):
        """
        Get context data including the current user.

        Adds the current user to the template context for display
        in the profile template.

        Args:
            **kwargs: Additional context data

        Returns:
            Dictionary of context data including the current user
        """
        context = super().get_context_data(**kwargs)
        context['user'] = self.request.user
        return context


class CreateUser(SuccessMessageMixin[Any], CreateView[User, Any]):
    """
    View for user registration.

    This view handles user registration with proper form validation,
    password hashing, and success message handling. It ensures that
    only one user can be created in the system and automatically
    assigns superuser privileges to the first user.

    Attributes:
        model: The User model to create
        template_name: Template for rendering the registration form
        form_class: Form class for user registration
        success_url: URL to redirect after successful registration
        success_message: Message shown after successful registration
    """

    model = User
    template_name = 'users/register.html'
    form_class = RegisterUserForm
    success_url = reverse_lazy('login')
    success_message = gettext_lazy('Пользователь успешно зарегистрирован')

    def dispatch(self, request, *args, **kwargs):
        """
        Handle request dispatch with registration availability check.

        Prevents registration if users already exist in the system,
        ensuring only one user can be created.

        Args:
            request: The HTTP request object
            *args: Additional positional arguments
            **kwargs: Additional keyword arguments

        Returns:
            Normal dispatch response or PermissionDenied exception

        Raises:
            PermissionDenied: If users already exist in the system
        """
        if User.objects.exists():
            raise PermissionDenied(
                gettext(
                    'Регистрация недоступна. В системе уже есть пользователи.'
                )
            )
        return super().dispatch(request, *args, **kwargs)

    def form_valid(self, form):
        """
        Handle valid form submission for user creation.

        Processes the validated registration form, hashes the password,
        and assigns superuser privileges to the first user in the system.

        Args:
            form: The validated user registration form

        Returns:
            HTTP response after successful user creation
        """
        user = form.save(commit=False)
        user.set_password(form.cleaned_data['password1'])

        if not User.objects.exists():
            user.is_superuser = True
            user.is_staff = True

        user.save()
        return super().form_valid(form)


class LoginUser(SuccessMessageMixin[Any], LoginView):
    """
    View for user authentication.

    This view handles user login with custom form validation and
    success message handling. It extends Django's LoginView to
    provide a customized login experience.

    Attributes:
        model: The User model for authentication
        template_name: Template for rendering the login form
        form_class: Form class for user authentication
        next_page: URL to redirect after successful login
        success_message: Message shown after successful login
    """

    model = User
    template_name = 'users/login.html'
    form_class = AuthUserForm
    next_page = '/'
    success_message = gettext_lazy('Вы залогинены')


class LogoutUser(LogoutView, SuccessMessageMixin[Any]):
    """
    View for user logout.

    This view handles user logout with success message handling
    and proper redirect behavior. It extends Django's LogoutView
    to provide a customized logout experience.

    Attributes:
        success_message: Message shown after successful logout
    """

    success_message = gettext_lazy('Вы разлогинены')

    def dispatch(self, request, *args, **kwargs):
        """
        Handle request dispatch with logout message handling.

        Processes logout requests and displays appropriate success
        messages to the user.

        Args:
            request: The HTTP request object
            *args: Additional positional arguments
            **kwargs: Additional keyword arguments

        Returns:
            HTTP response after logout processing
        """
        redirect_to = self.get_success_url()
        if redirect_to != request.get_full_path():
            return HttpResponseRedirect(redirect_to)
        messages.add_message(
            request, messages.SUCCESS, gettext('Вы разлогинены')
        )
        return super().dispatch(request, *args, **kwargs)


class UpdateUser(
    LoginRequiredMixin,
    SuccessMessageMixin[Any],
    UpdateView[User, Any],
):
    """
    View for updating user profile information.

    This view allows authenticated users to update their profile
    information with proper permission checks and success message
    handling. Users can only update their own profiles.

    Attributes:
        model: The User model to update
        template_name: Template for rendering the update form
        form_class: Form class for user updates
        success_url: URL to redirect after successful update
        success_message: Message shown after successful update
        error_message: Message shown when user lacks permissions
        no_permission_url: URL to redirect when permission denied
    """

    model = User
    template_name = 'users/update.html'
    form_class = RegisterUserForm
    success_url = reverse_lazy('tasks:list')
    success_message = gettext_lazy('Пользователь успешно изменён')
    error_message = gettext_lazy(
        'У вас нет разрешения на изменение другого пользователя'
    )
    no_permission_url = 'tasks:list'

    def test_func(self) -> Any:
        """
        Test if the user can update the profile.

        Checks whether the current user is updating their own profile,
        ensuring users can only modify their own information.

        Returns:
            True if the user is updating their own profile, False otherwise
        """
        return self.request.user == self.get_object()


class DeleteUser(  # type: ignore
    LoginRequiredMixin,
    SuccessMessageMixin[Any],
    DeleteView[User, Any],
):
    """
    View for deleting user accounts.

    This view allows authenticated users to delete their accounts
    with proper permission checks and error handling for protected
    relationships. Users can only delete their own accounts.

    Attributes:
        model: The User model to delete
        template_name: Template for rendering the deletion confirmation
        success_url: URL to redirect after successful deletion
        success_message: Message shown after successful deletion
        error_message: Message shown when deletion fails
        no_permission_url: URL to redirect when permission denied
    """

    model = User
    template_name = 'users/delete.html'
    success_url = reverse_lazy('tasks:list')
    success_message = gettext_lazy('Пользователь успешно удалён')
    error_message: StrPromise = gettext_lazy(
        'У вас нет разрешения на изменение другого '
        'пользователя, либо пользователь связан с '
        'задачей'
    )
    no_permission_url = 'tasks:list'

    def form_valid(self, form: ModelForm[User]) -> HttpResponse:
        """
        Handle valid form submission for user deletion.

        Processes user deletion with proper error handling for
        protected relationships and displays appropriate messages.

        Args:
            form: The validated deletion form

        Returns:
            HTTP response after deletion processing
        """
        try:
            self.object.delete()
        except ProtectedError:
            messages.error(self.request, self.error_message)
        else:
            messages.success(self.request, self.success_message)
        return HttpResponseRedirect(self.success_url)

    def test_func(self) -> Any:
        """
        Test if the user can delete the account.

        Checks whether the current user is deleting their own account,
        ensuring users can only delete their own profiles.

        Returns:
            True if the user is deleting their own account, False otherwise
        """
        return self.request.user == self.get_object()


class SwitchThemeMode(TemplateView):
    """
    View for switching user theme mode.

    This view handles AJAX requests to toggle between light and dark
    theme modes for the current user. It updates the user's theme
    preference and returns the new mode as JSON.

    Attributes:
        model: The User model for theme updates
        template_name: Template for rendering theme controls
    """

    model = User
    template_name = 'header.html'

    def post(
        self,
        request: HttpRequest,
        *args: tuple[Any],
        **kwargs: dict[str, Any],
    ) -> HttpResponse:
        """
        Handle POST requests for theme mode switching.

        Toggles the current user's theme mode between light and dark
        and returns the new mode as a JSON response.

        Args:
            request: The HTTP request object
            *args: Additional positional arguments
            **kwargs: Additional keyword arguments

        Returns:
            JSON response with the new theme mode
        """
        current_user = User.objects.get(username=self.request.user.username)

        if current_user.theme_mode == 'dark':
            current_user.theme_mode = 'light'
        else:
            current_user.theme_mode = 'dark'

        current_user.save()

        return JsonResponse({'theme_mode': current_user.theme_mode})


@method_decorator(csrf_exempt, name='dispatch')
class UpdateThemeColor(LoginRequiredMixin, TemplateView):
    """
    View for updating user theme color.

    This view handles AJAX requests to update the user's theme color
    preference. It validates the color against allowed values and
    provides appropriate error handling and success responses.

    The view is CSRF exempt to allow AJAX requests from external
    sources or when CSRF tokens are not available.

    Attributes:
        template_name: Template for rendering theme controls
    """

    def post(
        self,
        request: HttpRequest,
        *args: tuple[Any],
        **kwargs: dict[str, Any],
    ) -> JsonResponse:
        """
        Handle POST requests for theme color updates.

        Processes theme color update requests with validation and
        error handling. Returns appropriate JSON responses for
        success and error cases.

        Args:
            request: The HTTP request object containing JSON data
            *args: Additional positional arguments
            **kwargs: Additional keyword arguments

        Returns:
            JSON response indicating success or failure with details
        """
        try:
            request_data = json.loads(request.body)
            theme_color = request_data.get('theme_color')

            validation_error = self._validate_theme_color(theme_color)
            if validation_error:
                return validation_error

            return self._update_user_theme_color(request.user, theme_color)

        except json.JSONDecodeError:
            return self._handle_json_error()
        except Exception as error:
            return self._handle_general_error(error)

    def _validate_theme_color(
        self, theme_color: str | None
    ) -> JsonResponse | None:
        """
        Validate theme color and return error response if invalid.

        Checks if the provided theme color is valid according to
        the allowed color constants.

        Args:
            theme_color: The theme color to validate

        Returns:
            JSON error response if validation fails, None if valid
        """
        if not theme_color:
            return JsonResponse({
                'success': False,
                'error': 'Цвет темы не указан',
            })

        if theme_color not in VALID_THEME_COLORS:
            return JsonResponse({
                'success': False,
                'error': 'Недопустимый цвет темы',
            })

        return None

    def _update_user_theme_color(
        self, user: Any, theme_color: str
    ) -> JsonResponse:
        """
        Update user's theme color and return success response.

        Saves the new theme color to the user's profile and
        returns a success response with the updated color.

        Args:
            user: The user object to update
            theme_color: The new theme color to set

        Returns:
            JSON response indicating successful update
        """
        user.theme_color = theme_color
        user.save()
        return JsonResponse({'success': True, 'theme_color': theme_color})

    def _handle_json_error(self) -> JsonResponse:
        """
        Handle JSON decode error.

        Returns a standardized error response when the request
        body contains invalid JSON data.

        Returns:
            JSON response with JSON decode error message
        """
        return JsonResponse({
            'success': False,
            'error': 'Неверный формат данных',
        })

    def _handle_general_error(self, error: Exception) -> JsonResponse:
        """
        Handle general exceptions.

        Returns a standardized error response for unexpected
        exceptions that occur during request processing.

        Args:
            error: The exception that occurred

        Returns:
            JSON response with error details
        """
        return JsonResponse({'success': False, 'error': str(error)})
