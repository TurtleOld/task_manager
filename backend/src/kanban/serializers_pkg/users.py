from __future__ import annotations

from typing import Any

from django.contrib.auth import get_user_model
from django.contrib.auth.models import AbstractUser, Permission
from django.contrib.auth.password_validation import validate_password
from django.utils.translation import gettext_lazy as _
from rest_framework import serializers

from ..models import NotificationProfile

User = get_user_model()

PERMISSION_MAP: dict[str, tuple[str, str]] = {
    "boards:view": ("kanban", "view_board"),
    "boards:add": ("kanban", "add_board"),
    "boards:edit": ("kanban", "change_board"),
    "boards:delete": ("kanban", "delete_board"),
    "columns:view": ("kanban", "view_column"),
    "columns:add": ("kanban", "add_column"),
    "columns:edit": ("kanban", "change_column"),
    "columns:delete": ("kanban", "delete_column"),
    "cards:view": ("kanban", "view_card"),
    "cards:add": ("kanban", "add_card"),
    "cards:edit": ("kanban", "change_card"),
    "cards:delete": ("kanban", "delete_card"),
}

ROLE_PRESETS: dict[str, list[str]] = {
    "admin": list(PERMISSION_MAP.keys()),
    "manager": [
        "boards:view", "boards:add", "boards:edit",
        "columns:view", "columns:add", "columns:edit",
        "cards:view", "cards:add", "cards:edit", "cards:delete",
    ],
    "editor": [
        "boards:view",
        "columns:view", "columns:add", "columns:edit",
        "cards:view", "cards:add", "cards:edit",
    ],
    "viewer": ["boards:view", "columns:view", "cards:view"],
}


class UserSerializer(serializers.ModelSerializer[AbstractUser]):
    full_name = serializers.CharField(source="first_name")
    is_admin = serializers.SerializerMethodField()
    role = serializers.SerializerMethodField()
    permissions = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ["id", "username", "full_name", "is_admin", "role", "permissions"]

    def get_is_admin(self, obj: AbstractUser) -> bool:
        return bool(obj.is_staff or obj.is_superuser)

    def get_role(self, obj: AbstractUser) -> str:
        return "owner" if (obj.is_superuser or obj.is_staff) else "member"

    def get_permissions(self, obj: AbstractUser) -> list[str]:
        return sorted([
            key for key, pair in PERMISSION_MAP.items()
            if obj.user_permissions.filter(content_type__app_label=pair[0], codename=pair[1]).exists()
        ])


class UserUpdateSerializer(serializers.Serializer):
    full_name = serializers.CharField(max_length=150, required=False, allow_blank=True)
    role = serializers.ChoiceField(choices=[("owner", "owner"), ("member", "member")], required=False)

    def update(self, instance: AbstractUser, validated_data: dict[str, Any]) -> AbstractUser:
        full_name = validated_data.get("full_name")
        if full_name is not None:
            instance.first_name = full_name
        role = validated_data.get("role")
        if role is not None:
            instance.is_staff = role == "owner"
            instance.is_superuser = role == "owner"
        instance.save()
        return instance


class CurrentUserUpdateSerializer(serializers.Serializer):
    full_name = serializers.CharField(max_length=150, required=False, allow_blank=True)

    def update(self, instance: AbstractUser, validated_data: dict[str, Any]) -> AbstractUser:
        full_name = validated_data.get("full_name")
        if full_name is not None:
            instance.first_name = full_name
            instance.save(update_fields=["first_name"])
        return instance


class PasswordChangeSerializer(serializers.Serializer):
    new_password = serializers.CharField(write_only=True, min_length=8)

    def validate_new_password(self, value: str) -> str:
        validate_password(value)
        return value

    def update(self, instance: AbstractUser, validated_data: dict[str, Any]) -> AbstractUser:
        validate_password(validated_data["new_password"], user=instance)
        instance.set_password(validated_data["new_password"])
        instance.save(update_fields=["password"])
        return instance


class RegisterSerializer(serializers.Serializer):
    username = serializers.CharField(max_length=150)
    password = serializers.CharField(write_only=True)
    full_name = serializers.CharField(max_length=150, required=False, allow_blank=True)
    role = serializers.ChoiceField(choices=[("owner", "owner"), ("member", "member")], default="member", required=False)

    def validate_username(self, value: str) -> str:
        if User.objects.filter(username=value).exists():
            raise serializers.ValidationError(_("Пользователь уже существует"))
        return value

    def validate_password(self, value: str) -> str:
        validate_password(value)
        return value

    def create(self, validated_data: dict[str, Any]) -> AbstractUser:
        role = validated_data.get("role") or "member"
        user = User(username=validated_data["username"])
        full_name = validated_data.get("full_name")
        if full_name:
            user.first_name = full_name
        validate_password(validated_data["password"], user=user)
        user.set_password(validated_data["password"])
        user.is_staff = role == "owner"
        user.save()
        NotificationProfile.objects.get_or_create(user=user)
        return user
