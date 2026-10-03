from __future__ import annotations

import os
import subprocess
import sys
from datetime import timedelta

import pytest
from asgiref.sync import async_to_sync
from channels.testing import WebsocketCommunicator
from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework.test import APIClient

from config import settings as project_settings
from config.asgi import application
from kanban.models import UserSession
from tests.auth_helpers import csrf_token, login_client, session_key
from tests.test_production_security import BACKEND_DIR

ALLOWED_ORIGIN = project_settings.WEBSOCKET_ALLOWED_ORIGINS[0]
PROTOCOL = "tm.v1"


@pytest.fixture(autouse=True)
def _in_memory_channel_layer(settings) -> None:
    settings.CHANNEL_LAYERS = {"default": {"BACKEND": "channels.layers.InMemoryChannelLayer"}}


@pytest.fixture()
def client(db: None) -> APIClient:
    get_user_model().objects.create_user("ws-user", password="x")
    return login_client("ws-user", "x")


def _cookie_header(client: APIClient) -> str:
    return "; ".join(f"{name}={morsel.value}" for name, morsel in client.cookies.items())


@async_to_sync
async def _open(
    *,
    origin: str | None = ALLOWED_ORIGIN,
    cookie: str = "",
    subprotocols: list[str] | None = None,
) -> tuple[str, object]:
    headers = [(b"origin", origin.encode())] if origin else []
    if cookie:
        headers.append((b"cookie", cookie.encode()))
    communicator = WebsocketCommunicator(
        application, "/ws/boards/1/", headers=headers, subprotocols=subprotocols
    )
    connected, subprotocol = await communicator.connect()
    if not connected:
        return "refused", subprotocol
    if not await communicator.receive_nothing():
        message = await communicator.receive_output()
        assert message["type"] == "websocket.close"
        return "closed", message.get("code")
    await communicator.disconnect()
    return "open", subprotocol


def _open_as(client: APIClient, **kwargs: object) -> tuple[str, object]:
    kwargs.setdefault("subprotocols", [PROTOCOL, csrf_token(client)])
    return _open(cookie=_cookie_header(client), **kwargs)


@pytest.mark.django_db(transaction=True)
def test_session_cookie_and_csrf_subprotocol_are_accepted(client: APIClient) -> None:
    assert _open_as(client) == ("open", PROTOCOL)


@pytest.mark.django_db(transaction=True)
def test_token_in_query_string_does_not_authenticate(client: APIClient) -> None:
    assert _open(subprotocols=[PROTOCOL, csrf_token(client)]) == ("closed", 4001)


@pytest.mark.django_db(transaction=True)
@pytest.mark.parametrize(
    "subprotocols",
    [None, [PROTOCOL], [PROTOCOL, "forged-csrf-token"]],
    ids=["no-subprotocol", "no-csrf", "wrong-csrf"],
)
def test_missing_or_wrong_csrf_is_closed(client: APIClient, subprotocols) -> None:
    assert _open_as(client, subprotocols=subprotocols) == ("closed", 4001)


@pytest.mark.django_db(transaction=True)
def test_expired_session_is_closed(client: APIClient) -> None:
    UserSession.objects.filter(session_key=session_key(client)).update(
        expire_date=timezone.now() - timedelta(seconds=1)
    )

    assert _open_as(client) == ("closed", 4001)


@pytest.mark.django_db(transaction=True)
def test_logged_out_session_is_closed(client: APIClient) -> None:
    cookie = _cookie_header(client)
    subprotocols = [PROTOCOL, csrf_token(client)]
    client.post("/api/v1/auth/logout/")

    assert _open(cookie=cookie, subprotocols=subprotocols) == ("closed", 4001)


@pytest.mark.django_db(transaction=True)
@pytest.mark.parametrize("allowed_hosts", [["*"], ["tasks.example.com"]])
@pytest.mark.parametrize("origin", ["https://evil.example.com", "https://tasks.example.com", None])
def test_foreign_or_missing_origin_is_rejected(
    settings, client: APIClient, allowed_hosts: list[str], origin: str | None
) -> None:
    settings.ALLOWED_HOSTS = allowed_hosts

    assert _open_as(client, origin=origin)[0] == "refused"


def _import_settings(*, debug: bool, frontend_base_url: str) -> subprocess.CompletedProcess:
    env = {
        "PATH": os.environ.get("PATH", ""),
        "DJANGO_SECRET_KEY": "test",
        "DJANGO_DEBUG": "true" if debug else "false",
        "FRONTEND_BASE_URL": frontend_base_url,
        "PYTHONPATH": str(BACKEND_DIR / "src"),
    }
    return subprocess.run(
        [
            sys.executable,
            "-c",
            "from config import settings; print(*settings.WEBSOCKET_ALLOWED_ORIGINS)",
        ],
        env=env,
        capture_output=True,
        text=True,
    )


def test_empty_allowlist_fails_startup() -> None:
    result = _import_settings(debug=False, frontend_base_url="")

    assert result.returncode != 0
    assert "FRONTEND_BASE_URL" in result.stderr


def test_debug_adds_local_dev_origins() -> None:
    result = _import_settings(debug=True, frontend_base_url="")

    assert result.returncode == 0
    assert "http://localhost:5173" in result.stdout.split()


def test_production_allowlist_is_frontend_origin_only() -> None:
    result = _import_settings(debug=False, frontend_base_url="https://tasks.example.com/app")

    assert result.stdout.split() == ["https://tasks.example.com"]
