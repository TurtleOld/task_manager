from __future__ import annotations

from django.contrib.auth import authenticate, get_user_model
from django.contrib.auth.models import AnonymousUser
from rest_framework import permissions, status
from rest_framework.authtoken.models import Token
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from ..serializers import CurrentUserUpdateSerializer, RegisterSerializer, UserSerializer

User = get_user_model()


class RegisterView(APIView):
    permission_classes = [permissions.AllowAny]

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

        token, _ = Token.objects.get_or_create(user=user)
        is_owner = user.is_staff or user.is_superuser
        return Response(
            {
                "id": user.id,
                "username": user.username,
                "full_name": user.first_name,
                "is_admin": is_owner,
                "role": "owner" if is_owner else "member",
                "token": token.key,
            },
            status=201,
        )


class LoginView(APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request: Request) -> Response:
        payload = request.data or {}
        username = payload.get("username")
        password = payload.get("password")
        if not username or not password:
            return Response({"detail": "Username and password required"}, status=400)
        user = authenticate(request, username=username, password=password)
        if user is None:
            return Response(
                {"detail": "Неверный логин или пароль"},
                status=status.HTTP_401_UNAUTHORIZED,
            )
        token, _ = Token.objects.get_or_create(user=user)
        is_owner = user.is_staff or user.is_superuser
        return Response(
            {
                "id": user.id,
                "username": user.username,
                "full_name": user.first_name,
                "is_admin": is_owner,
                "role": "owner" if is_owner else "member",
                "token": token.key,
            }
        )


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
        Token.objects.filter(user=request.user).delete()
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
