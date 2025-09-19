from rest_framework.permissions import BasePermission, IsAuthenticated


class IsAuthenticatedOrOptions(IsAuthenticated):
    """Разрешает доступ аутентифицированным пользователям или OPTIONS."""

    def has_permission(self, request, view):
        # Разрешаем OPTIONS запросы без аутентификации
        if request.method == 'OPTIONS':
            return True

        # Для остальных запросов требуем аутентификацию
        return super().has_permission(request, view)


class IsStaffOrReadOnly(BasePermission):
    """Разрешает полный доступ только персоналу, остальным только чтение."""

    def has_permission(self, request, view):
        # Разрешаем OPTIONS запросы без аутентификации
        if request.method == 'OPTIONS':
            return True

        # Для чтения (GET, HEAD) требуем только аутентификацию
        if request.method in {'GET', 'HEAD'}:
            return request.user and request.user.is_authenticated

        # Для записи требуем права персонала
        return (
            request.user
            and request.user.is_authenticated
            and request.user.is_staff
        )
