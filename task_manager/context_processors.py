from django.contrib.auth.models import AnonymousUser


def theme_mode(request):
    if isinstance(request.user, AnonymousUser):
        theme_mode = (
            'light'  # Значение по умолчанию для анонимного пользователя
        )
    else:
        theme_mode = request.user.theme_mode

    return {'theme_mode': theme_mode}
