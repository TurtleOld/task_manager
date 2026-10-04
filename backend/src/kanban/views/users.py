from __future__ import annotations

from django.contrib.auth import HASH_SESSION_KEY, authenticate, get_user_model
from django.contrib.auth.base_user import AbstractBaseUser
from rest_framework import permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from ..serializers import PasswordChangeSerializer, UserSerializer, UserUpdateSerializer
from ..session_termination import end_other_user_sessions, end_user_sessions

User = get_user_model()


class IsAdminUser(permissions.BasePermission):
    def has_permission(self, request: Request, view: APIView) -> bool:
        return bool(request.user and request.user.is_authenticated and request.user.is_staff)


class UserAdminViewSet(viewsets.ViewSet):
    permission_classes = [IsAdminUser]

    def get_permissions(self) -> list[permissions.BasePermission]:
        # Changing your own password must not require admin rights.
        if self.action == "change_password":
            return [permissions.IsAuthenticated()]
        return super().get_permissions()

    def list(self, request: Request) -> Response:
        users = User.objects.all().order_by("id")
        return Response(UserSerializer(users, many=True).data)

    def retrieve(self, request: Request, pk: str | None = None) -> Response:
        user = User.objects.filter(id=pk).first()
        if not user:
            return Response({"detail": "Not found"}, status=404)
        return Response(UserSerializer(user).data)

    def partial_update(self, request: Request, pk: str | None = None) -> Response:
        user = User.objects.filter(id=pk).first()
        if not user:
            return Response({"detail": "Not found"}, status=404)
        serializer = UserUpdateSerializer(user, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(UserSerializer(user).data)

    @action(detail=True, methods=["post"], url_path="change-password")
    def change_password(self, request: Request, pk: str | None = None) -> Response:
        user = User.objects.filter(id=pk).first()
        is_self = user is not None and user.pk == request.user.pk
        if user is None or (not is_self and not request.user.is_staff):
            return Response({"detail": "Not found"}, status=404)

        if is_self:
            rejection = self._current_password_rejection(request, user)
            if rejection is not None:
                return rejection

        serializer = PasswordChangeSerializer(user, data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save()

        if is_self:
            end_other_user_sessions(user.pk, request.session.session_key)
            # Django invalidates a session whose stored password hash no
            # longer matches, so the session that made this request has to be
            # refreshed or the person would be signed out of their own device.
            request.session[HASH_SESSION_KEY] = user.get_session_auth_hash()
        else:
            end_user_sessions(user.pk)
        return Response({"detail": "Password updated"})

    @staticmethod
    def _current_password_rejection(request: Request, user: AbstractBaseUser) -> Response | None:
        # A hijacked session must not be enough to take the account over: the
        # change also ends every other session of the owner. authenticate()
        # routes wrong guesses through axes, so they lock out like login does.
        current_password = request.data.get("current_password")
        if not current_password:
            return Response(
                {"current_password": ["Введите текущий пароль"]},
                status=status.HTTP_400_BAD_REQUEST,
            )
        authenticated = authenticate(
            request, username=user.get_username(), password=current_password
        )
        if getattr(request, "axes_locked_out", False):
            return Response(
                {"detail": "Слишком много неудачных попыток, попробуйте позже"},
                status=status.HTTP_429_TOO_MANY_REQUESTS,
            )
        if authenticated is None or authenticated.pk != user.pk:
            return Response(
                {"current_password": ["Неверный текущий пароль"]},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return None
