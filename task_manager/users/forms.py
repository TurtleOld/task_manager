from django.contrib.auth.forms import UserCreationForm, AuthenticationForm
from django.forms import CharField, PasswordInput
from task_manager.users.models import User


class RegisterUserForm(UserCreationForm):
    class Meta:
        model = User
        fields = [
            'first_name',
            'last_name',
            'username',
            'password1',
            'password2',
        ]


class AuthUserForm(AuthenticationForm):
    username = CharField(
        label='Имя пользователя',
    )
    password = CharField(
        label='Пароль',
        strip=False,
        widget=PasswordInput,
    )
