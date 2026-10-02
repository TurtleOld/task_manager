from __future__ import annotations

import os
import subprocess
import sys

import pytest
from asgiref.sync import async_to_sync
from channels.testing import WebsocketCommunicator
from django.contrib.auth import get_user_model
from rest_framework.authtoken.models import Token

from config import settings as project_settings
from config.asgi import application
from tests.test_production_security import BACKEND_DIR

ALLOWED_ORIGIN = project_settings.WEBSOCKET_ALLOWED_ORIGINS[0]


@pytest.fixture(autouse=True)
def _in_memory_channel_layer(settings) -> None:
    settings.CHANNEL_LAYERS = {
        "default": {"BACKEND": "channels.layers.InMemoryChannelLayer"}
    }


@pytest.fixture()
def token_key(db: None) -> str:
    user = get_user_model().objects.create_user("ws-user", password="x")
    return Token.objects.create(user=user).key


@async_to_sync
async def _connect(token_key: str, origin: str | None) -> bool:
    headers = [(b"origin", origin.encode())] if origin else []
    communicator = WebsocketCommunicator(
        application,
        f"/ws/boards/1/?token={token_key}",
        headers=headers,
    )
    connected, _ = await communicator.connect()
    if connected:
        await communicator.disconnect()
    return connected


@pytest.mark.django_db(transaction=True)
def test_allowed_origin_is_accepted(token_key: str) -> None:
    assert _connect(token_key, ALLOWED_ORIGIN) is True


@pytest.mark.django_db(transaction=True)
@pytest.mark.parametrize("allowed_hosts", [["*"], ["tasks.example.com"]])
@pytest.mark.parametrize(
    "origin", ["https://evil.example.com", "https://tasks.example.com", None]
)
def test_foreign_or_missing_origin_is_rejected(
    settings, token_key: str, allowed_hosts: list[str], origin: str | None
) -> None:
    settings.ALLOWED_HOSTS = allowed_hosts

    assert _connect(token_key, origin) is False


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
            "from config import settings; "
            "print(*settings.WEBSOCKET_ALLOWED_ORIGINS)",
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
    result = _import_settings(
        debug=False, frontend_base_url="https://tasks.example.com/app"
    )

    assert result.stdout.split() == ["https://tasks.example.com"]
