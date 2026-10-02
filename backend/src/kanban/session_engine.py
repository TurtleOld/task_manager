from __future__ import annotations

from datetime import timedelta
from typing import Any

from django.conf import settings
from django.contrib.auth import SESSION_KEY
from django.contrib.sessions.backends.db import SessionStore as DBSessionStore
from django.utils import timezone


class SessionStore(DBSessionStore):
    """Database sessions that also record who logged in, from what and when."""

    def __init__(self, session_key: str | None = None) -> None:
        super().__init__(session_key)
        self.user_agent_label = ""
        self.login_at = None
        self.last_activity = None

    @classmethod
    def get_model_class(cls) -> Any:
        from .models import UserSession

        return UserSession

    def load(self) -> dict[str, Any]:
        row = self._get_session_from_db()
        if row is None:
            self._session_key = None
            return {}
        self.user_agent_label = row.user_agent_label
        self.login_at = row.login_at
        self.last_activity = row.last_activity
        return self.decode(row.session_data)

    def create_model_instance(self, data: dict[str, Any]) -> Any:
        row = super().create_model_instance(data)
        now = timezone.now()
        user_id = data.get(SESSION_KEY)
        row.user_id = int(user_id) if user_id else None
        row.user_agent_label = self.user_agent_label
        row.login_at = self.login_at or now
        row.last_activity = self.last_activity or now
        return row

    def extend(self) -> None:
        """Push expiry to a full lifetime from now without rewriting the data."""
        now = timezone.now()
        self.get_model_class().objects.filter(
            session_key=self.session_key
        ).update(
            expire_date=now + timedelta(seconds=settings.SESSION_COOKIE_AGE),
            last_activity=now,
        )
        self.last_activity = now
