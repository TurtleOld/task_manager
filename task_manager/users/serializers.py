from django.contrib.auth import authenticate
from rest_framework import serializers

from task_manager.users.models import User


class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = [
            'id', 'username', 'email', 'first_name', 'last_name',
            'theme_mode', 'theme_color'
        ]


class LoginSerializer(serializers.Serializer):
    username = serializers.CharField(
        max_length=150,
        help_text='Имя пользователя или email для входа в систему'
    )
    password = serializers.CharField(
        write_only=True,
        style={'input_type': 'password'},
        help_text='Пароль'
    )

    def validate(self, attrs):
        username = attrs.get('username')
        password = attrs.get('password')

        if not username or not password:
            raise serializers.ValidationError(
                'Необходимо указать имя пользователя и пароль.',
                code='authorization'
            )

        user = authenticate(username=username, password=password)
        if not user:
            try:
                user_obj = User.objects.get(email=username)
                user = authenticate(
                    username=user_obj.username, password=password
                )
            except User.DoesNotExist:
                pass

        if not user:
            raise serializers.ValidationError(
                'Неверные учетные данные.',
                code='authorization'
            )

        if not user.is_active:
            raise serializers.ValidationError(
                'Аккаунт пользователя деактивирован.',
                code='authorization'
            )

        attrs['user'] = user
        return attrs
