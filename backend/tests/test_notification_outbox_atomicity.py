from __future__ import annotations

from unittest.mock import patch

import pytest
from rest_framework.test import APIClient

from kanban.models import Board, Card, NotificationEvent


class _Boom(Exception):
    pass


def _raise_boom(*args: object, **kwargs: object) -> None:
    raise _Boom("create_notification_event failed")


@pytest.mark.django_db()
def test_card_create_rolls_back_when_event_creation_fails(
    auth_client: APIClient, board: Board
) -> None:
    auth_client.raise_request_exception = False

    with patch("kanban.views.cards.create_notification_event", side_effect=_raise_boom):
        resp = auth_client.post(
            "/api/v1/cards/",
            data={"board": board.id, "title": "Rollback me"},
            format="json",
        )

    assert resp.status_code == 500
    assert not Card.objects.filter(title="Rollback me").exists()
    assert not NotificationEvent.objects.filter(event_type="card.created").exists()


@pytest.mark.django_db()
def test_card_complete_rolls_back_when_event_creation_fails(
    auth_client: APIClient, card: Card
) -> None:
    auth_client.raise_request_exception = False

    with patch("kanban.views.cards.create_notification_event", side_effect=_raise_boom):
        resp = auth_client.post(f"/api/v1/cards/{card.id}/complete/")

    assert resp.status_code == 500
    card.refresh_from_db()
    assert card.completed_at is None
    assert not NotificationEvent.objects.filter(event_type="card.completed").exists()


@pytest.mark.django_db()
def test_board_create_rolls_back_when_event_creation_fails(auth_client: APIClient) -> None:
    auth_client.raise_request_exception = False

    with patch("kanban.views.boards.create_notification_event", side_effect=_raise_boom):
        resp = auth_client.post("/api/v1/boards/", data={"name": "Rollback list"}, format="json")

    assert resp.status_code == 500
    assert not Board.objects.filter(name="Rollback list").exists()
    assert not NotificationEvent.objects.filter(event_type="board.created").exists()


@pytest.mark.django_db()
def test_board_update_rolls_back_when_event_creation_fails(
    auth_client: APIClient, board: Board
) -> None:
    auth_client.raise_request_exception = False
    original_name = board.name

    with patch("kanban.views.boards.create_notification_event", side_effect=_raise_boom):
        resp = auth_client.patch(
            f"/api/v1/boards/{board.id}/",
            data={"name": "Renamed list"},
            format="json",
        )

    assert resp.status_code == 500
    board.refresh_from_db()
    assert board.name == original_name
    assert not NotificationEvent.objects.filter(event_type="board.updated").exists()


@pytest.mark.django_db()
def test_board_destroy_rolls_back_when_event_creation_fails(
    auth_client: APIClient, board: Board
) -> None:
    auth_client.raise_request_exception = False
    board_id = board.id

    with patch("kanban.views.boards.create_notification_event", side_effect=_raise_boom):
        resp = auth_client.delete(f"/api/v1/boards/{board_id}/")

    assert resp.status_code == 500
    assert Board.objects.filter(id=board_id).exists()
    assert not NotificationEvent.objects.filter(event_type="board.deleted").exists()


@pytest.mark.django_db()
def test_board_archive_rolls_back_when_event_creation_fails(
    auth_client: APIClient, board: Board
) -> None:
    auth_client.raise_request_exception = False

    with patch("kanban.views.boards.create_notification_event", side_effect=_raise_boom):
        resp = auth_client.post(f"/api/v1/boards/{board.id}/archive/")

    assert resp.status_code == 500
    board.refresh_from_db()
    assert board.archived_at is None
    assert not NotificationEvent.objects.filter(event_type="board.updated").exists()


@pytest.mark.django_db()
def test_board_unarchive_rolls_back_when_event_creation_fails(
    auth_client: APIClient, board: Board
) -> None:
    auth_client.raise_request_exception = False
    from django.utils import timezone

    board.archived_at = timezone.now()
    board.save(update_fields=["archived_at"])

    with patch("kanban.views.boards.create_notification_event", side_effect=_raise_boom):
        resp = auth_client.post(f"/api/v1/boards/{board.id}/unarchive/")

    assert resp.status_code == 500
    board.refresh_from_db()
    assert board.archived_at is not None
    assert not NotificationEvent.objects.filter(event_type="board.updated").exists()


@pytest.mark.django_db()
def test_board_force_delete_rolls_back_when_event_creation_fails(
    auth_client: APIClient, board: Board
) -> None:
    auth_client.raise_request_exception = False
    from django.utils import timezone

    board.archived_at = timezone.now()
    board.save(update_fields=["archived_at"])
    board_id = board.id

    with patch("kanban.views.boards.create_notification_event", side_effect=_raise_boom):
        resp = auth_client.delete(f"/api/v1/boards/{board_id}/force-delete/")

    assert resp.status_code == 500
    assert Board.with_archived.filter(id=board_id).exists()
    assert not NotificationEvent.objects.filter(event_type="board.deleted").exists()
