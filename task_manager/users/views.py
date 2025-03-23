from typing import Any
from django.contrib.auth.mixins import LoginRequiredMixin
from django.contrib.auth.views import LoginView, LogoutView
from django.forms import ModelForm
from django.views.generic import TemplateView
from django.contrib import messages
from django.contrib.messages.views import SuccessMessageMixin
from django.db.models import ProtectedError
from django.http import (
    HttpRequest,
    HttpResponse,
    HttpResponseRedirect,
    JsonResponse,
)
from django.shortcuts import redirect
from django.utils.translation import gettext, gettext_lazy
from django_stubs_ext import StrPromise
from django.urls import reverse_lazy
from django.views.generic.list import ListView
from django.views.generic.edit import (
    CreateView,
    UpdateView,
    DeleteView,
)
from task_manager.users.models import User
from task_manager.users.forms import RegisterUserForm, AuthUserForm


class IndexView(TemplateView):
    def dispatch(self, request, *args, **kwargs):
        if request.user.is_authenticated:
            return redirect('tasks:list')
        return redirect('login')


class ProfileUser(LoginRequiredMixin, ListView[User]):
    model = User
    template_name = 'users/profile.html'
    context_object_name = 'profile'


class CreateUser(SuccessMessageMixin[Any], CreateView[User, Any]):
    model = User
    template_name = 'users/register.html'
    form_class = RegisterUserForm
    success_url = reverse_lazy('login')
    success_message = gettext_lazy('Пользователь успешно зарегистрирован')


class LoginUser(SuccessMessageMixin[Any], LoginView):
    model = User
    template_name = 'users/login.html'
    form_class = AuthUserForm
    next_page = '/'
    success_message = gettext_lazy('Вы залогинены')


class LogoutUser(LogoutView, SuccessMessageMixin[Any]):
    def dispatch(self, request, *args, **kwargs):
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
    success_url = reverse_lazy('users:list')
    success_message = gettext_lazy('Пользователь успешно изменён')
    error_message = gettext_lazy(
        'У вас нет разрешения на изменение другого ' 'пользователя'
    )
    no_permission_url = 'users:list'

    def test_func(self) -> Any:
        return self.request.user == self.get_object()


class DeleteUser(  # type: ignore
    LoginRequiredMixin,
    SuccessMessageMixin[Any],
    DeleteView[User, Any],
):
    model = User
    template_name = 'users/delete.html'
    success_url = reverse_lazy('users:list')
    success_message = gettext_lazy('Пользователь успешно удалён')
    error_message: StrPromise = gettext_lazy(
        'У вас нет разрешения на изменение другого '
        'пользователя, либо пользователь связан с '
        'задачей'
    )
    no_permission_url = 'users:list'

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

        # Переключаем тему
        if current_user.theme_mode == 'dark':
            current_user.theme_mode = 'light'
        else:
            current_user.theme_mode = 'dark'

        current_user.save()

        # Возвращаем JSON с новой темой
        return JsonResponse({'theme_mode': current_user.theme_mode})
