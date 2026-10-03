from __future__ import annotations

from django.contrib.auth import authenticate, get_user_model, login, logout
from django.contrib.auth.models import AnonymousUser
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import ensure_csrf_cookie
from rest_framework import permissions, status
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from ..authentication import CsrfProtected
from ..serializers import CurrentUserUpdateSerializer, RegisterSerializer, UserSerializer
from ..session_termination import end_user_sessions
from ..throttling import LoginRateThrottle

User = get_user_model()


@method_decorator(ensure_csrf_cookie, name="get")
class CsrfCookieView(APIView):
    permission_classes = [permissions.AllowAny]

    def get(self, request: Request) -> Response:
        return Response(status=status.HTTP_204_NO_CONTENT)


class RegisterView(APIView):
    permission_classes = [CsrfProtected]

    def post(self, request: Request) -> Response:
        user_count = User.objects.count()
        requester = request.user
        allow = user_count == 0 or (not isinstance(requester, AnonymousUser) and requester.is_staff)
        if not allow:
            return Response({"detail": "Registration is not allowed"}, status=403)

        serializer = RegisterSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        if user_count == 0:
            user.is_staff = True
            user.is_superuser = True
            user.save(update_fields=["is_staff", "is_superuser"])
            login(request, user, backend="django.contrib.auth.backends.ModelBackend")

        return Response(UserSerializer(user).data, status=201)


class LoginView(APIView):
    permission_classes = [CsrfProtected]
    throttle_classes = [LoginRateThrottle]

    def post(self, request: Request) -> Response:
        payload = request.data or {}
        username = payload.get("username")
        password = payload.get("password")
        if not username or not password:
            return Response({"detail": "Username and password required"}, status=400)
        user = authenticate(request, username=username, password=password)
        if getattr(request, "axes_locked_out", False):
            return Response(
                {"detail": "Слишком много неудачных попыток, попробуйте позже"},
                status=status.HTTP_429_TOO_MANY_REQUESTS,
            )
        if user is None:
            return Response(
                {"detail": "Неверный логин или пароль"},
                status=status.HTTP_401_UNAUTHORIZED,
            )
        login(request, user)
        return Response(UserSerializer(user).data)


class LogoutView(APIView):
    def post(self, request: Request) -> Response:
        logout(request)
        return Response(status=status.HTTP_204_NO_CONTENT)


class CurrentUserView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request: Request) -> Response:
        return Response(UserSerializer(request.user).data)

    def patch(self, request: Request) -> Response:
        serializer = CurrentUserUpdateSerializer(request.user, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(UserSerializer(request.user).data)


class TerminateSessionsView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request: Request) -> Response:
        user_id = request.user.pk
        logout(request)
        end_user_sessions(user_id)
        return Response(status=status.HTTP_204_NO_CONTENT)


class RegistrationStatusView(APIView):
    permission_classes = [permissions.AllowAny]

    def get(self, request: Request) -> Response:
        user_count = User.objects.count()
        requester = request.user
        allow_admin = not isinstance(requester, AnonymousUser) and requester.is_staff
        return Response(
            {
                "user_count": user_count,
                "allow_first": user_count == 0,
                "allow_admin": allow_admin,
            }
        )
