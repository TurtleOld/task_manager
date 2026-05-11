from __future__ import annotations

import pytest
from rest_framework.test import APIClient

from kanban.models import Board, Card, Column


def test_board_templates_list(auth_client: APIClient) -> None:
    resp = auth_client.get("/api/v1/boards/templates/")

    assert resp.status_code == 200
    ids = {item["id"] for item in resp.json()}
    assert {"family", "renovation", "vacation", "shopping"} <= ids


@pytest.mark.django_db()
def test_create_board_with_icon_and_color(api_client: APIClient) -> None:
    resp = api_client.post(
        "/api/v1/boards/",
        data={"name": "Home", "icon": "🏡", "color": "#16a34a"},
        format="json",
    )

    assert resp.status_code == 201
    data = resp.json()
    assert data["icon"] == "🏡"
    assert data["color"] == "#16a34a"
    board = Board.objects.get(id=data["id"])
    assert board.icon == "🏡"
    assert board.color == "#16a34a"


@pytest.mark.django_db()
def test_create_board_from_template(auth_client: APIClient) -> None:
    resp = auth_client.post(
        "/api/v1/boards/from-template/",
        data={"template_id": "vacation", "name": "Лето"},
        format="json",
    )

    assert resp.status_code == 201
    data = resp.json()
    assert data["name"] == "Лето"
    assert data["icon"] == "🏖️"
    assert data["color"] == "#0891b2"

    board = Board.objects.get(id=data["id"])
    columns = list(Column.objects.filter(board=board).order_by("position"))
    assert [column.name for column in columns] == ["План", "Бронирования", "Собрать", "Готово"]
    assert columns[-1].is_done is True
    assert Card.objects.filter(board=board).count() == 2
    assert Card.objects.filter(board=board, labels__name="Важно").exists()


@pytest.mark.django_db()
def test_create_board_from_unknown_template_returns_404(auth_client: APIClient) -> None:
    resp = auth_client.post(
        "/api/v1/boards/from-template/",
        data={"template_id": "missing"},
        format="json",
    )

    assert resp.status_code == 404
