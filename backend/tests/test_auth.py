from __future__ import annotations

import pytest
from django.conf import settings
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from kanban.models import Board, PushDevice, UserSession
from tests.auth_helpers import (
    LOGIN_URL,
    csrf_client,
    csrf_token,
    login_client,
    make_push_device,
    session_key,
)

User = get_user_model()


# ---------------------------------------------------------------------------
# /api/v1/auth/registration-status/
# ---------------------------------------------------------------------------


@pytest.mark.django_db()
def test_registration_status_no_users(api_client: APIClient) -> None:
    resp = api_client.get("/api/v1/auth/registration-status/")
    assert resp.status_code == 200
    data = resp.json()
    assert data["allow_first"] is True
    assert data["user_count"] == 0


@pytest.mark.django_db()
def test_registration_status_with_existing_user(
    api_client: APIClient, regular_user: object
) -> None:
    resp = api_client.get("/api/v1/auth/registration-status/")
    assert resp.status_code == 200
    data = resp.json()
    assert data["allow_first"] is False
    assert data["user_count"] == 1


# ---------------------------------------------------------------------------
# /api/v1/auth/register/
# ---------------------------------------------------------------------------


@pytest.mark.django_db()
def test_first_user_registers_as_admin() -> None:
    client = csrf_client()
    resp = client.post(
        "/api/v1/auth/register/",
        data={
            "username": "alice",
            "password": "blue-kettle-77",
            "full_name": "Alice",
        },
        format="json",
        HTTP_X_CSRFTOKEN=csrf_token(client),
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["username"] == "alice"
    assert data["is_admin"] is True
    assert "token" not in data

    user = User.objects.get(username="alice")
    assert user.is_superuser is True
    assert user.is_staff is True
    # Registration no longer auto-creates a personal inbox list.
    assert not Board.objects.filter(owner=user, is_inbox=True).exists()
    assert UserSession.objects.get(session_key=session_key(client)).user == user
    assert client.get("/api/v1/auth/me/").json()["username"] == "alice"


@pytest.mark.django_db()
def test_first_user_registration_requires_csrf() -> None:
    resp = csrf_client().post(
        "/api/v1/auth/register/",
        data={"username": "alice", "password": "blue-kettle-77"},
        format="json",
    )

    assert resp.status_code == 403
    assert not User.objects.exists()


@pytest.mark.django_db()
def test_second_user_registration_blocked_for_anonymous(
    api_client: APIClient, regular_user: object
) -> None:
    resp = api_client.post(
        "/api/v1/auth/register/",
        data={"username": "bob", "password": "blue-kettle-77"},
        format="json",
    )
    assert resp.status_code == 403


@pytest.mark.django_db()
def test_admin_can_register_new_user(admin_client: APIClient) -> None:
    resp = admin_client.post(
        "/api/v1/auth/register/",
        data={
            "username": "bob",
            "password": "blue-kettle-77",
            "full_name": "Bob",
        },
        format="json",
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["username"] == "bob"
    # bob is not admin by default
    assert data["is_admin"] is False
    assert "token" not in data
    assert not UserSession.objects.filter(user__username="bob").exists()
    assert admin_client.get("/api/v1/auth/me/").json()["username"] == "admin"


@pytest.mark.django_db()
def test_register_missing_fields(api_client: APIClient) -> None:
    resp = api_client.post(
        "/api/v1/auth/register/",
        data={"username": "nopass"},
        format="json",
    )
    assert resp.status_code in {400, 403}


# ---------------------------------------------------------------------------
# /api/v1/auth/login/
# ---------------------------------------------------------------------------


@pytest.mark.django_db()
def test_login_opens_a_session_without_a_token(regular_user: User) -> None:
    client = csrf_client(HTTP_USER_AGENT="Mozilla/5.0 (X11; Linux x86_64) Firefox/131.0")
    resp = client.post(
        LOGIN_URL,
        data={"username": "user1", "password": "pass1"},
        format="json",
        HTTP_X_CSRFTOKEN=csrf_token(client),
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "token" not in data
    assert data["username"] == "user1"

    session = UserSession.objects.get(session_key=session_key(client))
    assert session.user == regular_user
    assert session.user_agent_label == "Firefox на Linux"
    cookie = resp.cookies[settings.SESSION_COOKIE_NAME]
    assert cookie["httponly"]
    assert cookie["samesite"] == "Lax"


@pytest.mark.django_db()
def test_login_without_csrf_is_rejected(regular_user: User) -> None:
    resp = csrf_client().post(
        LOGIN_URL, data={"username": "user1", "password": "pass1"}, format="json"
    )

    assert resp.status_code == 403
    assert not UserSession.objects.filter(user=regular_user).exists()


@pytest.mark.django_db()
def test_login_rotates_the_csrf_token(regular_user: User) -> None:
    client = csrf_client()
    before = csrf_token(client)

    client.post(
        LOGIN_URL,
        data={"username": "user1", "password": "pass1"},
        format="json",
        HTTP_X_CSRFTOKEN=before,
    )

    assert csrf_token(client) != before


@pytest.mark.django_db()
def test_csrf_endpoint_sets_cookie() -> None:
    resp = APIClient().get("/api/v1/auth/csrf/")

    assert resp.status_code == 204
    assert settings.CSRF_COOKIE_NAME in resp.cookies


@pytest.mark.django_db()
def test_login_wrong_password(regular_user: object) -> None:
    client = csrf_client()
    resp = client.post(
        LOGIN_URL,
        data={"username": "user1", "password": "wrong"},
        format="json",
        HTTP_X_CSRFTOKEN=csrf_token(client),
    )
    assert resp.status_code == 401
    assert resp.json()["detail"] == "Неверный логин или пароль"


@pytest.mark.django_db()
def test_login_missing_fields() -> None:
    client = csrf_client()
    resp = client.post(
        LOGIN_URL,
        data={"username": "user1"},
        format="json",
        HTTP_X_CSRFTOKEN=csrf_token(client),
    )
    assert resp.status_code == 400


@pytest.mark.django_db()
def test_me_without_session_is_unauthorized() -> None:
    assert APIClient().get("/api/v1/auth/me/").status_code == 401


@pytest.mark.django_db()
def test_mutating_request_without_csrf_header_is_rejected(auth_client: APIClient) -> None:
    auth_client.credentials()

    resp = auth_client.post("/api/v1/boards/", data={"name": "Без CSRF"}, format="json")

    assert resp.status_code == 403
    assert not Board.objects.filter(name="Без CSRF").exists()


# ---------------------------------------------------------------------------
# logout / terminate-sessions
# ---------------------------------------------------------------------------


@pytest.mark.django_db()
def test_logout_ends_only_the_current_session(regular_user: User) -> None:
    laptop = login_client("user1", "pass1")
    phone = login_client("user1", "pass1")
    make_push_device(
        regular_user,
        session=UserSession.objects.get(session_key=session_key(laptop)),
        endpoint="https://push.example.com/laptop",
    )

    assert laptop.post("/api/v1/auth/logout/").status_code == 204

    assert laptop.get("/api/v1/auth/me/").status_code == 401
    assert phone.get("/api/v1/auth/me/").status_code == 200
    assert UserSession.objects.filter(user=regular_user).count() == 1
    assert not PushDevice.objects.filter(endpoint="https://push.example.com/laptop").exists()


@pytest.mark.django_db()
def test_terminate_sessions_ends_every_session_and_device(
    regular_user: User, admin_client: APIClient
) -> None:
    laptop = login_client("user1", "pass1")
    phone = login_client("user1", "pass1")
    make_push_device(
        regular_user,
        session=UserSession.objects.get(session_key=session_key(phone)),
        endpoint="https://push.example.com/phone",
    )

    assert laptop.post("/api/v1/auth/terminate-sessions/").status_code == 204

    assert laptop.get("/api/v1/auth/me/").status_code == 401
    assert phone.get("/api/v1/auth/me/").status_code == 401
    assert not UserSession.objects.filter(user=regular_user).exists()
    assert not PushDevice.objects.filter(user=regular_user).exists()
    assert admin_client.get("/api/v1/auth/me/").status_code == 200


# ---------------------------------------------------------------------------
# /api/v1/users/ — role model
# ---------------------------------------------------------------------------


@pytest.mark.django_db()
def test_user_responses_expose_no_permission_registry(
    admin_client: APIClient, regular_user: User
) -> None:
    me = admin_client.get("/api/v1/auth/me/")
    assert me.status_code == 200
    assert "permissions" not in me.json()

    listing = admin_client.get("/api/v1/users/")
    assert listing.status_code == 200
    assert listing.json()
    assert all("permissions" not in row for row in listing.json())

    detail = admin_client.get(f"/api/v1/users/{regular_user.id}/")
    assert detail.status_code == 200
    assert "permissions" not in detail.json()


@pytest.mark.django_db()
def test_admin_can_switch_user_between_roles(admin_client: APIClient, regular_user: User) -> None:
    promoted = admin_client.patch(
        f"/api/v1/users/{regular_user.id}/",
        data={"role": "owner"},
        format="json",
    )
    assert promoted.status_code == 200
    assert promoted.json()["role"] == "owner"
    assert promoted.json()["is_admin"] is True

    demoted = admin_client.patch(
        f"/api/v1/users/{regular_user.id}/",
        data={"role": "member"},
        format="json",
    )
    assert demoted.status_code == 200
    assert demoted.json()["role"] == "member"
    assert demoted.json()["is_admin"] is False
