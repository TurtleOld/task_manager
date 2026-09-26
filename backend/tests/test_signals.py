from __future__ import annotations

from unittest.mock import patch

import pytest
from django.contrib.auth import get_user_model
from rest_framework.authtoken.models import Token

from kanban.models import PushDevice

User = get_user_model()


@pytest.mark.django_db()
def test_deactivating_a_user_revokes_devices_and_token(regular_user: User) -> None:
    Token.objects.get_or_create(user=regular_user)
    PushDevice.objects.create(
        user=regular_user,
        kind=PushDevice.Kind.WEBPUSH,
        endpoint="https://push.example.com/a",
        p256dh="p256dh-key",
        auth="auth-key",
    )

    with patch("kanban.signals.disconnect_user_websockets") as mock_disconnect:
        regular_user.is_active = False
        regular_user.save()

    assert not Token.objects.filter(user=regular_user).exists()
    assert not PushDevice.objects.filter(user=regular_user).exists()
    mock_disconnect.assert_called_once_with(regular_user.id)


@pytest.mark.django_db()
def test_reactivating_a_user_does_not_touch_devices(regular_user: User) -> None:
    regular_user.is_active = False
    regular_user.save()
    PushDevice.objects.create(
        user=regular_user,
        kind=PushDevice.Kind.WEBPUSH,
        endpoint="https://push.example.com/a",
        p256dh="p256dh-key",
        auth="auth-key",
    )

    with patch("kanban.signals.disconnect_user_websockets") as mock_disconnect:
        regular_user.is_active = True
        regular_user.save()

    assert PushDevice.objects.filter(user=regular_user).exists()
    mock_disconnect.assert_not_called()


@pytest.mark.django_db()
def test_saving_an_already_deactivated_user_does_not_error(regular_user: User) -> None:
    regular_user.is_active = False
    regular_user.save()

    regular_user.first_name = "Иван"
    regular_user.save()
