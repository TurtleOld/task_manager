from __future__ import annotations

from django.db import transaction
from django.db.models import QuerySet

from .broadcast import disconnect_session_websockets
from .models import UserSession


def end_session(session_key: str | None) -> None:
    """End one session; its Devices go with it by cascade."""
    if not session_key:
        return
    _end_sessions(UserSession.objects.filter(session_key=session_key))


def end_user_sessions(user_id: int) -> None:
    """End every session of a person; their Devices go with them by cascade."""
    _end_sessions(UserSession.objects.filter(user_id=user_id))


def end_other_user_sessions(user_id: int, keep_session_key: str | None) -> None:
    """End every session of a person except the one making the request."""
    sessions = UserSession.objects.filter(user_id=user_id)
    if keep_session_key:
        sessions = sessions.exclude(session_key=keep_session_key)
    _end_sessions(sessions)


def _end_sessions(sessions: QuerySet[UserSession]) -> None:
    session_keys = list(sessions.values_list("session_key", flat=True))
    sessions.delete()
    _close_websockets_after_commit(session_keys)


def _close_websockets_after_commit(session_keys: list[str]) -> None:
    if not session_keys:
        return
    transaction.on_commit(lambda: disconnect_session_websockets(session_keys))
