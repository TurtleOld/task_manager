from __future__ import annotations

import uuid
from unittest.mock import patch

import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from kanban.models import PushDevice, UserSession
from tests.auth_helpers import login_client, make_push_device, session_key

User = get_user_model()
SESSIONS_URL = "/api/v1/auth/sessions/"


def _session_for(client: APIClient) -> UserSession:
    return UserSession.objects.get(session_key=session_key(client))


@pytest.mark.django_db()
def test_list_sessions_returns_own_sessions_with_flags(regular_user: User) -> None:
    laptop = login_client(
        "user1", "pass1", HTTP_USER_AGENT="Mozilla/5.0 (X11; Linux x86_64) Firefox/131.0"
    )
    phone = login_client(
        "user1", "pass1", HTTP_USER_AGENT="Mozilla/5.0 (Linux; Android 14) Chrome/120.0"
    )
    phone_session = _session_for(phone)
    make_push_device(regular_user, session=phone_session, endpoint="https://push.example.com/phone")

    resp = laptop.get(SESSIONS_URL)

    assert resp.status_code == 200
    rows = resp.json()
    assert len(rows) == 2
    by_id = {row["id"]: row for row in rows}
    laptop_row = by_id[str(_session_for(laptop).public_id)]
    phone_row = by_id[str(phone_session.public_id)]

    assert laptop_row["label"] == "Firefox на Linux"
    assert laptop_row["current"] is True
    assert laptop_row["notifications_enabled"] is False
    assert phone_row["label"] == "Chrome на Android"
    assert phone_row["current"] is False
    assert phone_row["notifications_enabled"] is True
    assert laptop_row["login_at"] and laptop_row["last_activity"]

    body = resp.content.decode()
    assert "session_key" not in body
    assert session_key(laptop) not in body
    assert session_key(phone) not in body


@pytest.mark.django_db()
def test_list_sessions_excludes_other_people(regular_user: User) -> None:
    User.objects.create_user(username="user2", password="pass2")
    login_client("user2", "pass2")
    mine = login_client("user1", "pass1")

    resp = mine.get(SESSIONS_URL)

    assert resp.status_code == 200
    assert [row["id"] for row in resp.json()] == [str(_session_for(mine).public_id)]


@pytest.mark.django_db()
def test_list_sessions_requires_authentication(api_client: APIClient) -> None:
    assert api_client.get(SESSIONS_URL).status_code in {401, 403}


@pytest.mark.django_db()
def test_delete_other_session_ends_it_and_its_devices(regular_user: User) -> None:
    laptop = login_client("user1", "pass1")
    phone = login_client("user1", "pass1")
    phone_session = _session_for(phone)
    make_push_device(regular_user, session=phone_session, endpoint="https://push.example.com/phone")

    resp = laptop.delete(f"{SESSIONS_URL}{phone_session.public_id}/")

    assert resp.status_code == 204
    assert not UserSession.objects.filter(pk=phone_session.pk).exists()
    assert not PushDevice.objects.filter(session_id=phone_session.pk).exists()
    assert laptop.get("/api/v1/auth/me/").status_code == 200


@pytest.mark.django_db()
def test_delete_current_session_is_rejected(regular_user: User) -> None:
    laptop = login_client("user1", "pass1")
    current = _session_for(laptop)

    resp = laptop.delete(f"{SESSIONS_URL}{current.public_id}/")

    assert resp.status_code == 400
    assert UserSession.objects.filter(pk=current.pk).exists()


@pytest.mark.django_db()
def test_delete_session_of_another_person_is_not_found(regular_user: User) -> None:
    User.objects.create_user(username="user2", password="pass2")
    other = login_client("user2", "pass2")
    other_session = _session_for(other)
    mine = login_client("user1", "pass1")

    resp = mine.delete(f"{SESSIONS_URL}{other_session.public_id}/")

    assert resp.status_code == 404
    assert UserSession.objects.filter(pk=other_session.pk).exists()


@pytest.mark.django_db()
def test_delete_unknown_session_is_not_found(regular_user: User) -> None:
    mine = login_client("user1", "pass1")

    resp = mine.delete(f"{SESSIONS_URL}{uuid.uuid4()}/")

    assert resp.status_code == 404


@pytest.mark.django_db()
def test_delete_session_requires_csrf(regular_user: User) -> None:
    laptop = login_client("user1", "pass1")
    phone = login_client("user1", "pass1")
    phone_session = _session_for(phone)
    laptop.credentials()

    resp = laptop.delete(f"{SESSIONS_URL}{phone_session.public_id}/")

    assert resp.status_code == 403
    assert UserSession.objects.filter(pk=phone_session.pk).exists()


@pytest.mark.django_db()
def test_delete_session_closes_its_websockets(
    regular_user: User, django_capture_on_commit_callbacks
) -> None:
    laptop = login_client("user1", "pass1")
    phone = login_client("user1", "pass1")
    phone_session = _session_for(phone)

    with patch("kanban.session_termination.disconnect_session_websockets") as mock_disconnect:
        with django_capture_on_commit_callbacks(execute=True):
            resp = laptop.delete(f"{SESSIONS_URL}{phone_session.public_id}/")

    assert resp.status_code == 204
    mock_disconnect.assert_called_once_with([phone_session.session_key])
