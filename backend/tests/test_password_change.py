from __future__ import annotations

from unittest.mock import patch

import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from kanban.models import PushDevice, UserSession
from tests.auth_helpers import login_client, make_push_device, session_key

User = get_user_model()


@pytest.mark.django_db()
def test_self_password_change_keeps_current_session_and_ends_the_rest(
    regular_user, django_capture_on_commit_callbacks
) -> None:
    laptop = login_client("user1", "pass1")
    phone = login_client("user1", "pass1")
    laptop_session = UserSession.objects.get(session_key=session_key(laptop))
    phone_session = UserSession.objects.get(session_key=session_key(phone))
    make_push_device(
        regular_user, session=laptop_session, endpoint="https://push.example.com/laptop"
    )
    make_push_device(regular_user, session=phone_session, endpoint="https://push.example.com/phone")

    with patch("kanban.session_termination.disconnect_session_websockets"):
        with django_capture_on_commit_callbacks(execute=True):
            response = laptop.post(
                f"/api/v1/users/{regular_user.pk}/change-password/",
                data={"new_password": "brand-new-pass-1", "current_password": "pass1"},
                format="json",
            )

    assert response.status_code == 200
    assert laptop.get("/api/v1/auth/me/").status_code == 200
    assert phone.get("/api/v1/auth/me/").status_code == 401
    assert UserSession.objects.filter(user=regular_user).count() == 1
    assert PushDevice.objects.filter(session=laptop_session).exists()
    assert not PushDevice.objects.filter(session=phone_session).exists()
    assert login_client("user1", "brand-new-pass-1").get("/api/v1/auth/me/").status_code == 200


@pytest.mark.django_db()
def test_admin_password_change_ends_every_target_session(
    regular_user, admin_client: APIClient, django_capture_on_commit_callbacks
) -> None:
    laptop = login_client("user1", "pass1")
    phone = login_client("user1", "pass1")
    for index, client in enumerate((laptop, phone)):
        make_push_device(
            regular_user,
            session=UserSession.objects.get(session_key=session_key(client)),
            endpoint=f"https://push.example.com/{index}",
        )

    with patch("kanban.session_termination.disconnect_session_websockets"):
        with django_capture_on_commit_callbacks(execute=True):
            response = admin_client.post(
                f"/api/v1/users/{regular_user.pk}/change-password/",
                data={"new_password": "brand-new-pass-1"},
                format="json",
            )

    assert response.status_code == 200
    assert laptop.get("/api/v1/auth/me/").status_code == 401
    assert phone.get("/api/v1/auth/me/").status_code == 401
    assert not UserSession.objects.filter(user=regular_user).exists()
    assert not PushDevice.objects.filter(user=regular_user).exists()
    assert admin_client.get("/api/v1/auth/me/").status_code == 200


@pytest.mark.django_db()
def test_member_cannot_change_another_users_password(auth_client: APIClient, regular_user) -> None:
    other = User.objects.create_user("user2", password="pass2")

    response = auth_client.post(
        f"/api/v1/users/{other.pk}/change-password/",
        data={"new_password": "brand-new-pass-1"},
        format="json",
    )

    assert response.status_code == 404
    assert other.check_password("pass2")


@pytest.mark.django_db()
@pytest.mark.parametrize("payload", [{}, {"current_password": "wrong-pass"}])
def test_self_password_change_requires_the_current_password(
    regular_user, payload: dict[str, str]
) -> None:
    laptop = login_client("user1", "pass1")
    phone = login_client("user1", "pass1")

    response = laptop.post(
        f"/api/v1/users/{regular_user.pk}/change-password/",
        data={"new_password": "brand-new-pass-1", **payload},
        format="json",
    )

    assert response.status_code == 400
    regular_user.refresh_from_db()
    assert regular_user.check_password("pass1")
    assert phone.get("/api/v1/auth/me/").status_code == 200


@pytest.mark.django_db()
def test_guessing_the_current_password_locks_out_like_login(regular_user, settings) -> None:
    laptop = login_client("user1", "pass1")
    url = f"/api/v1/users/{regular_user.pk}/change-password/"

    for _ in range(settings.AXES_FAILURE_LIMIT):
        laptop.post(
            url,
            data={"new_password": "brand-new-pass-1", "current_password": "guess"},
            format="json",
        )
    response = laptop.post(
        url,
        data={"new_password": "brand-new-pass-1", "current_password": "pass1"},
        format="json",
    )

    assert response.status_code == 429
    regular_user.refresh_from_db()
    assert regular_user.check_password("pass1")
