from __future__ import annotations

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

    regular_user.is_active = False
    regular_user.save()

    assert not Token.objects.filter(user=regular_user).exists()
    assert not PushDevice.objects.filter(user=regular_user).exists()


@pytest.mark.django_db()
def test_saving_an_already_deactivated_user_does_not_error(regular_user: User) -> None:
    regular_user.is_active = False
    regular_user.save()

    regular_user.first_name = "Иван"
    regular_user.save()
