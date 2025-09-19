from rest_framework.permissions import BasePermission, IsAuthenticated


class IsAuthenticatedOrOptions(IsAuthenticated):
    """Разрешает доступ аутентифицированным пользователям или OPTIONS."""

    def has_permission(self, request, view):
        if request.method == 'OPTIONS':
            return True

        return super().has_permission(request, view)


class IsStaffOrReadOnly(BasePermission):
    """Разрешает полный доступ только персоналу, остальным только чтение."""

    def has_permission(self, request, view):
        if request.method == 'OPTIONS':
            return True

        if request.method in {'GET', 'HEAD'}:
            return request.user and request.user.is_authenticated

        return (
            request.user
            and request.user.is_authenticated
            and request.user.is_staff
        )

    def has_object_permission(self, request, view, obj):
        """Check object-level permissions (same as view-level)."""
        return self.has_permission(request, view)
