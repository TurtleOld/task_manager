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
from django.views.generic.edit import CreateView, DeleteView, UpdateView
from django_stubs_ext import StrPromise
from task_manager.constants import VALID_THEME_COLORS
from task_manager.users.forms import AuthUserForm, RegisterUserForm
from task_manager.users.models import User


class IndexView(TemplateView):

    def dispatch(self, request, *args, **kwargs):
        if request.user.is_authenticated:
            return redirect('tasks:list')
        return redirect('login')


class ProfileUser(LoginRequiredMixin, TemplateView):
    template_name = "users/profile.html"

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        context['user'] = self.request.user
        return context


class CreateUser(SuccessMessageMixin[Any], CreateView[User, Any]):
    model = User
    template_name = 'users/register.html'
    form_class = RegisterUserForm
    success_url = reverse_lazy('login')
    success_message = gettext_lazy('Пользователь успешно зарегистрирован')

    def dispatch(self, request, *args, **kwargs):
        if User.objects.exists():
            raise PermissionDenied(
                gettext(
                    'Регистрация недоступна. В системе уже есть пользователи.'
                )
            )
        return super().dispatch(request, *args, **kwargs)

    def form_valid(self, form):
        user = form.save(commit=False)
        user.set_password(form.cleaned_data['password1'])

        if not User.objects.exists():
            user.is_superuser = True
            user.is_staff = True

        user.save()
        return super().form_valid(form)


class LoginUser(SuccessMessageMixin[Any], LoginView):
    model = User
    template_name = 'users/login.html'
    form_class = AuthUserForm
    next_page = '/'
    success_message = gettext_lazy('Вы залогинены')


class LogoutUser(LogoutView, SuccessMessageMixin[Any]):
    success_message = gettext_lazy("Вы разлогинены")

    def dispatch(self, request, *args, **kwargs):
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
        return self.request.user == self.get_object()


class DeleteUser(  # type: ignore
    LoginRequiredMixin,
    SuccessMessageMixin[Any],
    DeleteView[User, Any],
):
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
        try:
            self.object.delete()
        except ProtectedError:
            messages.error(self.request, self.error_message)
        else:
            messages.success(self.request, self.success_message)
        return HttpResponseRedirect(self.success_url)

    def test_func(self) -> Any:
        return self.request.user == self.get_object()


class SwitchThemeMode(TemplateView):
    model = User
    template_name = 'header.html'

    def post(
        self,
        request: HttpRequest,
        *args: tuple[Any],
        **kwargs: dict[str, Any],
    ) -> HttpResponse:
        current_user = User.objects.get(username=self.request.user.username)

        if current_user.theme_mode == 'dark':
            current_user.theme_mode = 'light'
        else:
            current_user.theme_mode = 'dark'

        current_user.save()

        return JsonResponse({'theme_mode': current_user.theme_mode})


@method_decorator(csrf_exempt, name='dispatch')
class UpdateThemeColor(LoginRequiredMixin, TemplateView):

    def post(
        self,
        request: HttpRequest,
        *args: tuple[Any],
        **kwargs: dict[str, Any],
    ) -> JsonResponse:
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

    def _validate_theme_color(self, theme_color: str | None) -> JsonResponse | None:
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

    def _update_user_theme_color(self, user: Any, theme_color: str) -> JsonResponse:
        user.theme_color = theme_color
        user.save()
        return JsonResponse({'success': True, 'theme_color': theme_color})

    def _handle_json_error(self) -> JsonResponse:
        return JsonResponse(
            {
                "success": False,
                "error": "Неверный формат данных",
            }
        )

    def _handle_general_error(self, error: Exception) -> JsonResponse:
        return JsonResponse({"success": False, "error": str(error)})
