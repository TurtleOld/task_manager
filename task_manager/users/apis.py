import logging

from django.contrib.auth import login, logout
from knox.views import LoginView as KnoxLoginView
from knox.views import LogoutView as KnoxLogoutView
from rest_framework import permissions, status
from rest_framework.authtoken.serializers import AuthTokenSerializer
from rest_framework.response import Response
from rest_framework.views import APIView

from task_manager.users.serializers import UserSerializer

logger = logging.getLogger(__name__)


class LoginView(KnoxLoginView):
    permission_classes = (permissions.AllowAny,)

    def post(self, request, format=None):  # noqa: A002
        serializer = AuthTokenSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.validated_data['user']
        login(request, user)
        return super().post(request, format=None)


class LogoutView(KnoxLogoutView):
    def get_post_response(self, request):
        username = request.user.username
        logout(request)
        logger.info('Пользователь %s вышел из системы', username)

        response = Response(
            {'message': 'Вы успешно вышли из системы'},
            status=status.HTTP_200_OK
        )
        response['Content-Type'] = 'application/json; charset=utf-8'
        return response


class UserProfileView(APIView):
    def get(self, request):
        if not request.user.is_authenticated:
            response = Response(
                {'error': 'Пользователь не аутентифицирован'},
                status=status.HTTP_401_UNAUTHORIZED,
            )
            response['Content-Type'] = 'application/json; charset=utf-8'
            return response

        serializer = UserSerializer(request.user)
        response = Response(
            {'user': serializer.data},
            status=status.HTTP_200_OK
        )
        response['Content-Type'] = 'application/json; charset=utf-8'
        return response
