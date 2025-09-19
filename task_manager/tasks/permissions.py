from rest_framework.permissions import IsAuthenticated


class IsAuthenticatedOrOptions(IsAuthenticated):
    """
    Разрешает доступ аутентифицированным пользователям или OPTIONS запросам.
    """

    def has_permission(self, request, view):
        # Разрешаем OPTIONS запросы без аутентификации
        if request.method == 'OPTIONS':
            return True

        # Для остальных запросов требуем аутентификацию
        return super().has_permission(request, view)
