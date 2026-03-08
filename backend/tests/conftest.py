from __future__ import annotations

import pytest
from django.contrib.auth import get_user_model
from rest_framework.authtoken.models import Token
from rest_framework.test import APIClient

from kanban.models import Board, Card, Column

User = get_user_model()


# ---------------------------------------------------------------------------
# Disable throttling globally for all tests
# ---------------------------------------------------------------------------

pytestmark = pytest.mark.django_db


@pytest.fixture(autouse=True)
def _no_throttle(settings: pytest.FixtureRequest) -> None:
    """Remove rate-limit throttle classes so tests don't hit 429."""
    settings.REST_FRAMEWORK = {
        **settings.REST_FRAMEWORK,
        "DEFAULT_THROTTLE_CLASSES": [],
        "DEFAULT_THROTTLE_RATES": {},
    }


# ---------------------------------------------------------------------------
# Celery / channel-layer stubs — keep tests hermetic (no broker, no Redis)
# ---------------------------------------------------------------------------


@pytest.fixture(autouse=True)
def _no_celery(monkeypatch: pytest.MonkeyPatch) -> None:
    """Make Celery .delay() a no-op in all tests."""

    class _Stub:
        def delay(self, *a: object, **kw: object) -> None:
            return None

    import kanban.notifications as notifications

    monkeypatch.setattr(notifications, "send_notification_event", _Stub())


@pytest.fixture(autouse=True)
def _no_channel_layer(monkeypatch: pytest.MonkeyPatch) -> None:
    """Return None from get_channel_layer() so broadcast is a no-op."""
    import kanban.broadcast as broadcast

    monkeypatch.setattr(broadcast, "get_channel_layer", lambda: None)


# ---------------------------------------------------------------------------
# Reusable model factories
# ---------------------------------------------------------------------------


@pytest.fixture()
def api_client() -> APIClient:
    return APIClient()


@pytest.fixture()
def admin_user(db: None) -> User:
    user = User.objects.create_superuser(username="admin", password="adminpass", first_name="Admin")
    user.is_staff = True
    user.is_superuser = True
    user.save()
    return user


@pytest.fixture()
def regular_user(db: None) -> User:
    return User.objects.create_user(username="user1", password="pass1", first_name="User One")


@pytest.fixture()
def admin_client(admin_user: User) -> APIClient:
    client = APIClient()
    token, _ = Token.objects.get_or_create(user=admin_user)
    client.credentials(HTTP_AUTHORIZATION=f"Token {token.key}")
    return client


@pytest.fixture()
def auth_client(regular_user: User) -> APIClient:
    client = APIClient()
    token, _ = Token.objects.get_or_create(user=regular_user)
    client.credentials(HTTP_AUTHORIZATION=f"Token {token.key}")
    return client


@pytest.fixture()
def board(db: None) -> Board:
    return Board.objects.create(name="Test Board")


@pytest.fixture()
def column(board: Board) -> Column:
    return Column.objects.create(board=board, name="To Do", icon="📋")


@pytest.fixture()
def card(column: Column) -> Card:
    return Card.objects.create(column=column, title="Test Card")
