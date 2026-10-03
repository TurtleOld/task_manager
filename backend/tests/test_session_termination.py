from __future__ import annotations

from unittest.mock import patch

import pytest
from django.db import transaction

from kanban.models import PushDevice, UserSession
from kanban.session_termination import (
    end_other_user_sessions,
    end_session,
    end_user_sessions,
)
from tests.auth_helpers import login_client, make_push_device, session_key


@pytest.mark.django_db()
def test_end_session_removes_devices_and_schedules_close(
    regular_user, django_capture_on_commit_callbacks
) -> None:
    client = login_client("user1", "pass1")
    session = UserSession.objects.get(session_key=session_key(client))
    make_push_device(regular_user, session=session, endpoint="https://push.example.com/a")

    with patch("kanban.session_termination.disconnect_session_websockets") as mock_disconnect:
        with django_capture_on_commit_callbacks(execute=True):
            end_session(session.session_key)

    assert not UserSession.objects.filter(pk=session.pk).exists()
    assert not PushDevice.objects.filter(session_id=session.pk).exists()
    mock_disconnect.assert_called_once_with([session.session_key])


@pytest.mark.django_db()
def test_end_user_sessions_ends_every_session(
    regular_user, django_capture_on_commit_callbacks
) -> None:
    login_client("user1", "pass1")
    login_client("user1", "pass1")
    keys = list(UserSession.objects.filter(user=regular_user).values_list("session_key", flat=True))

    with patch("kanban.session_termination.disconnect_session_websockets") as mock_disconnect:
        with django_capture_on_commit_callbacks(execute=True):
            end_user_sessions(regular_user.pk)

    assert not UserSession.objects.filter(user=regular_user).exists()
    mock_disconnect.assert_called_once()
    assert sorted(mock_disconnect.call_args[0][0]) == sorted(keys)


@pytest.mark.django_db()
def test_end_other_user_sessions_keeps_the_current_one(
    regular_user, django_capture_on_commit_callbacks
) -> None:
    laptop = login_client("user1", "pass1")
    phone = login_client("user1", "pass1")
    kept = session_key(laptop)
    removed = session_key(phone)

    with patch("kanban.session_termination.disconnect_session_websockets") as mock_disconnect:
        with django_capture_on_commit_callbacks(execute=True):
            end_other_user_sessions(regular_user.pk, kept)

    remaining = list(UserSession.objects.values_list("session_key", flat=True))
    assert remaining == [kept]
    mock_disconnect.assert_called_once_with([removed])


@pytest.mark.django_db(transaction=True)
def test_rollback_closes_nothing_and_restores_sessions(regular_user) -> None:
    client = login_client("user1", "pass1")
    session = UserSession.objects.get(session_key=session_key(client))

    with patch("kanban.session_termination.disconnect_session_websockets") as mock_disconnect:
        with pytest.raises(RuntimeError):
            with transaction.atomic():
                end_session(session.session_key)
                raise RuntimeError("later failure")

    assert UserSession.objects.filter(pk=session.pk).exists()
    mock_disconnect.assert_not_called()


@pytest.mark.django_db(transaction=True)
def test_commit_closes_sockets(regular_user) -> None:
    client = login_client("user1", "pass1")
    session = UserSession.objects.get(session_key=session_key(client))

    with patch("kanban.session_termination.disconnect_session_websockets") as mock_disconnect:
        with transaction.atomic():
            end_session(session.session_key)

    mock_disconnect.assert_called_once_with([session.session_key])
