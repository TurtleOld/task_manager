from __future__ import annotations

from unittest.mock import patch

import pytest
from django.contrib.auth import get_user_model

from kanban.models import PushDevice, UserSession
from tests.auth_helpers import login_client, make_push_device

User = get_user_model()


@pytest.mark.django_db()
def test_deactivating_a_user_ends_sessions_and_devices(regular_user: User) -> None:
    client = login_client("user1", "pass1")
    make_push_device(
        regular_user,
        kind=PushDevice.Kind.WEBPUSH,
        endpoint="https://push.example.com/a",
        p256dh="p256dh-key",
        auth="auth-key",
    )

    with patch("kanban.signals.disconnect_user_websockets") as mock_disconnect:
        regular_user.is_active = False
        regular_user.save()

    assert not UserSession.objects.filter(user=regular_user).exists()
    assert not PushDevice.objects.filter(user=regular_user).exists()
    assert client.get("/api/v1/auth/me/").status_code == 401
    mock_disconnect.assert_called_once_with(regular_user.id)


@pytest.mark.django_db()
def test_reactivating_a_user_does_not_touch_devices(regular_user: User) -> None:
    regular_user.is_active = False
    regular_user.save()
    make_push_device(
        regular_user,
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
