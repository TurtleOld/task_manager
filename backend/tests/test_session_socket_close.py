from __future__ import annotations

import pytest
from asgiref.sync import async_to_sync, sync_to_async
from channels.layers import get_channel_layer
from channels.testing import WebsocketCommunicator
from rest_framework.test import APIClient

from config import settings as project_settings
from config.asgi import application
from tests.auth_helpers import csrf_token, login_client

ALLOWED_ORIGIN = project_settings.WEBSOCKET_ALLOWED_ORIGINS[0]
PROTOCOL = "tm.v1"


@pytest.fixture(autouse=True)
def _in_memory_channel_layer(settings, monkeypatch) -> None:
    settings.CHANNEL_LAYERS = {"default": {"BACKEND": "channels.layers.InMemoryChannelLayer"}}
    import kanban.broadcast as broadcast

    monkeypatch.setattr(broadcast, "get_channel_layer", get_channel_layer)


def _communicator(client: APIClient) -> WebsocketCommunicator:
    cookie = "; ".join(f"{name}={morsel.value}" for name, morsel in client.cookies.items())
    headers = [(b"origin", ALLOWED_ORIGIN.encode()), (b"cookie", cookie.encode())]
    return WebsocketCommunicator(
        application,
        "/ws/boards/1/",
        headers=headers,
        subprotocols=[PROTOCOL, csrf_token(client)],
    )


async def _close_code(communicator: WebsocketCommunicator) -> int | None:
    message = await communicator.receive_output()
    assert message["type"] == "websocket.close"
    return message["code"]


@pytest.mark.django_db(transaction=True)
def test_logout_closes_only_that_session(regular_user) -> None:
    @async_to_sync
    async def scenario() -> None:
        laptop = await sync_to_async(login_client)("user1", "pass1")
        phone = await sync_to_async(login_client)("user1", "pass1")
        laptop_socket = _communicator(laptop)
        phone_socket = _communicator(phone)
        assert (await laptop_socket.connect())[0]
        assert (await phone_socket.connect())[0]

        await sync_to_async(laptop.post)("/api/v1/auth/logout/")

        assert await _close_code(laptop_socket) == 4001
        assert await phone_socket.receive_nothing()
        await phone_socket.disconnect()

    scenario()


@pytest.mark.django_db(transaction=True)
def test_terminate_all_closes_every_session_socket(regular_user) -> None:
    @async_to_sync
    async def scenario() -> None:
        laptop = await sync_to_async(login_client)("user1", "pass1")
        phone = await sync_to_async(login_client)("user1", "pass1")
        laptop_socket = _communicator(laptop)
        phone_socket = _communicator(phone)
        assert (await laptop_socket.connect())[0]
        assert (await phone_socket.connect())[0]

        await sync_to_async(laptop.post)("/api/v1/auth/terminate-sessions/")

        assert await _close_code(laptop_socket) == 4001
        assert await _close_code(phone_socket) == 4001

    scenario()


@pytest.mark.django_db(transaction=True)
def test_deactivation_closes_session_socket(regular_user) -> None:
    @async_to_sync
    async def scenario() -> None:
        client = await sync_to_async(login_client)("user1", "pass1")
        socket = _communicator(client)
        assert (await socket.connect())[0]

        def deactivate() -> None:
            regular_user.is_active = False
            regular_user.save()

        await sync_to_async(deactivate)()

        assert await _close_code(socket) == 4001

    scenario()


@pytest.mark.django_db(transaction=True)
def test_password_change_closes_the_other_session_socket(regular_user) -> None:
    @async_to_sync
    async def scenario() -> None:
        laptop = await sync_to_async(login_client)("user1", "pass1")
        phone = await sync_to_async(login_client)("user1", "pass1")
        laptop_socket = _communicator(laptop)
        phone_socket = _communicator(phone)
        assert (await laptop_socket.connect())[0]
        assert (await phone_socket.connect())[0]

        await sync_to_async(laptop.post)(
            f"/api/v1/users/{regular_user.pk}/change-password/",
            data={"new_password": "brand-new-pass-1"},
            format="json",
        )

        assert await _close_code(phone_socket) == 4001
        assert await laptop_socket.receive_nothing()

        # The current session keeps working, so its socket must stay subscribed
        # to the session that is actually stored: ending that session later has
        # to reach it.
        await sync_to_async(laptop.post)("/api/v1/auth/terminate-sessions/")
        assert await _close_code(laptop_socket) == 4001

    scenario()


@pytest.mark.django_db(transaction=True)
def test_admin_password_change_closes_target_socket(regular_user, admin_client: APIClient) -> None:
    @async_to_sync
    async def scenario() -> None:
        member = await sync_to_async(login_client)("user1", "pass1")
        socket = _communicator(member)
        assert (await socket.connect())[0]

        def admin_changes() -> None:
            response = admin_client.post(
                f"/api/v1/users/{regular_user.pk}/change-password/",
                data={"new_password": "brand-new-pass-1"},
                format="json",
            )
            assert response.status_code == 200

        await sync_to_async(admin_changes)()

        assert await _close_code(socket) == 4001

    scenario()
