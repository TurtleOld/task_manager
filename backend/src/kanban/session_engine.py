from __future__ import annotations

from datetime import datetime, timedelta
from typing import Any

from django.conf import settings
from django.contrib.auth import SESSION_KEY
from django.contrib.sessions.backends.base import UpdateError
from django.contrib.sessions.backends.db import SessionStore as DBSessionStore
from django.utils import timezone

EXTEND_AFTER = timedelta(days=1)


class SessionStore(DBSessionStore):
    def __init__(self, session_key: str | None = None) -> None:
        super().__init__(session_key)
        self.user_agent_label = ""
        self.login_at: datetime | None = None
        self.last_activity: datetime | None = None

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

    def mark_login(self, user_agent_label: str) -> None:
        now = timezone.now()
        self.user_agent_label = user_agent_label
        self.login_at = now
        self.last_activity = now

    def create_model_instance(self, data: dict[str, Any]) -> Any:
        row = super().create_model_instance(data)
        now = timezone.now()
        user_id = data.get(SESSION_KEY)
        row.user_id = int(user_id) if user_id else None
        row.user_agent_label = self.user_agent_label
        row.login_at = self.login_at or now
        row.last_activity = self.last_activity or now
        return row

    def save(self, must_create: bool = False) -> None:
        if must_create or self.session_key is None:
            super().save(must_create)
            return
        # Updates leave last_activity alone: a request that loaded the row
        # earlier must not roll back an extension made by a concurrent one.
        row = self.create_model_instance(self._get_session(no_load=False))
        updated = (
            self.get_model_class()
            .objects.filter(session_key=self.session_key)
            .update(
                session_data=row.session_data,
                expire_date=row.expire_date,
                user_id=row.user_id,
                user_agent_label=row.user_agent_label,
                login_at=row.login_at,
            )
        )
        if not updated:
            raise UpdateError

    def is_extension_due(self) -> bool:
        if self.session_key is None or self.last_activity is None:
            return False
        if self.get("_session_expiry") is not None:
            return False
        return timezone.now() - self.last_activity > EXTEND_AFTER

    def extend(self) -> bool:
        """Returns False if the session row no longer exists."""
        now = timezone.now()
        updated = (
            self.get_model_class()
            .objects.filter(session_key=self.session_key)
            .update(
                expire_date=now + timedelta(seconds=settings.SESSION_COOKIE_AGE),
                last_activity=now,
            )
        )
        if updated:
            self.last_activity = now
        return bool(updated)
