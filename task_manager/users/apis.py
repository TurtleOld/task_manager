import logging

from django.contrib.auth import login, logout
from django.utils import timezone
from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.throttling import AnonRateThrottle
from rest_framework.views import APIView

from task_manager.users.serializers import LoginSerializer, UserSerializer


logger = logging.getLogger(__name__)


class LoginView(APIView):
    permission_classes = [AllowAny]
    throttle_classes = [AnonRateThrottle]
    serializer_class = LoginSerializer

    def post(self, request):
        serializer = self.serializer_class(data=request.data)

        if not serializer.is_valid():
            logger.warning(
                'Неудачная попытка входа: %s', serializer.errors
            )
            return Response(
                {
                    'error': 'Ошибка валидации',
                    'details': serializer.errors
                },
                status=status.HTTP_400_BAD_REQUEST
            )

        try:
            user = serializer.validated_data['user']

            logger.info(
                'Пользователь %s успешно вошел в систему', user.username
            )

            login(request, user)

            user.last_login = timezone.now()
            user.save(update_fields=['last_login'])

            user_serializer = UserSerializer(user)

            return Response(
                {
                    'user': user_serializer.data,
                    'session_id': request.session.session_key
                },
                status=status.HTTP_200_OK
            )

        except Exception:
            logger.exception('Ошибка при входе пользователя')
            return Response(
                {
                    'error': 'Внутренняя ошибка сервера',
                    'message': 'Произошла ошибка при обработке запроса'
                },
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


class LogoutView(APIView):
    def post(self, request):
        if request.user.is_authenticated:
            username = request.user.username
            logout(request)
            logger.info('Пользователь %s вышел из системы', username)

            return Response(
                {
                    'message': 'Вы успешно вышли из системы'
                },
                status=status.HTTP_200_OK
            )

        return Response(
            {
                'error': 'Пользователь не аутентифицирован'
            },
            status=status.HTTP_401_UNAUTHORIZED
        )


class UserProfileView(APIView):
    def get(self, request):
        if not request.user.is_authenticated:
            return Response(
                {
                    'error': 'Пользователь не аутентифицирован'
                },
                status=status.HTTP_401_UNAUTHORIZED
            )

        serializer = UserSerializer(request.user)
        return Response(
            {
                'user': serializer.data
            },
            status=status.HTTP_200_OK
        )
