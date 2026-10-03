from __future__ import annotations

from .models import UserSession


def end_user_sessions(user_id: int) -> None:
    """End every session of a person; their Devices go with them by cascade."""
    UserSession.objects.filter(user_id=user_id).delete()
