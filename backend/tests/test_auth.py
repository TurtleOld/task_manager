from __future__ import annotations

import pytest
from django.contrib.auth import get_user_model
from rest_framework.authtoken.models import Token
from rest_framework.test import APIClient

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
def test_first_user_registers_as_admin(api_client: APIClient) -> None:
    resp = api_client.post(
        "/api/v1/auth/register/",
        data={"username": "alice", "password": "secret123", "full_name": "Alice"},
        format="json",
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["username"] == "alice"
    assert data["is_admin"] is True
    assert "token" in data

    user = User.objects.get(username="alice")
    assert user.is_superuser is True
    assert user.is_staff is True


@pytest.mark.django_db()
def test_second_user_registration_blocked_for_anonymous(
    api_client: APIClient, regular_user: object
) -> None:
    resp = api_client.post(
        "/api/v1/auth/register/",
        data={"username": "bob", "password": "secret123"},
        format="json",
    )
    assert resp.status_code == 403


@pytest.mark.django_db()
def test_admin_can_register_new_user(admin_client: APIClient) -> None:
    resp = admin_client.post(
        "/api/v1/auth/register/",
        data={"username": "bob", "password": "secret123", "full_name": "Bob"},
        format="json",
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["username"] == "bob"
    # bob is not admin by default
    assert data["is_admin"] is False


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
def test_login_success(api_client: APIClient, regular_user: object) -> None:
    resp = api_client.post(
        "/api/v1/auth/login/",
        data={"username": "user1", "password": "pass1"},
        format="json",
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "token" in data
    assert data["username"] == "user1"


@pytest.mark.django_db()
def test_login_wrong_password(api_client: APIClient, regular_user: object) -> None:
    resp = api_client.post(
        "/api/v1/auth/login/",
        data={"username": "user1", "password": "wrong"},
        format="json",
    )
    assert resp.status_code == 400


@pytest.mark.django_db()
def test_login_missing_fields(api_client: APIClient) -> None:
    resp = api_client.post(
        "/api/v1/auth/login/",
        data={"username": "user1"},
        format="json",
    )
    assert resp.status_code == 400


@pytest.mark.django_db()
def test_login_token_is_reused(api_client: APIClient, regular_user: object) -> None:
    """Logging in twice returns the same token."""
    r1 = api_client.post(
        "/api/v1/auth/login/",
        data={"username": "user1", "password": "pass1"},
        format="json",
    ).json()
    r2 = api_client.post(
        "/api/v1/auth/login/",
        data={"username": "user1", "password": "pass1"},
        format="json",
    ).json()
    assert r1["token"] == r2["token"]
    assert Token.objects.filter(user__username="user1").count() == 1
