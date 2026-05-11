from __future__ import annotations

import pytest
from rest_framework.test import APIClient

from kanban.models import Board, Card, Column, Label


@pytest.mark.django_db()
def test_search_finds_cards_and_boards(auth_client: APIClient) -> None:
    board = Board.objects.create(name="Семейный ремонт")
    column = Column.objects.create(board=board, name="To Do")
    card = Card.objects.create(column=column, title="Купить краску", description="Белая матовая")

    resp = auth_client.get("/api/v1/search/?q=краск")

    assert resp.status_code == 200
    data = resp.json()
    assert [item["id"] for item in data["cards"]] == [card.id]
    assert data["cards"][0]["board_name"] == board.name
    assert data["cards"][0]["column_name"] == column.name

    board_resp = auth_client.get("/api/v1/search/?q=ремонт")
    assert [item["id"] for item in board_resp.json()["boards"]] == [board.id]


@pytest.mark.django_db()
def test_search_finds_cards_by_label(auth_client: APIClient, column: Column) -> None:
    label = Label.objects.create(name="Финансы", color="#2563eb")
    card = Card.objects.create(column=column, title="Оплатить интернет")
    card.labels.add(label)

    resp = auth_client.get("/api/v1/search/?q=Финанс")

    assert resp.status_code == 200
    assert [item["id"] for item in resp.json()["cards"]] == [card.id]


@pytest.mark.django_db()
def test_search_hides_archived_cards_and_inbox_boards(
    auth_client: APIClient,
    regular_user: object,
) -> None:
    board = Board.objects.create(name="Visible board")
    column = Column.objects.create(board=board, name="To Do")
    archived = Card.objects.create(column=column, title="Hidden needle")
    auth_client.delete(f"/api/v1/cards/{archived.id}/")

    inbox_board = Board.objects.get(owner=regular_user, is_inbox=True)
    inbox_column = Column.objects.get(board=inbox_board, name="Inbox")
    Card.objects.create(column=inbox_column, title="Needle inbox")

    resp = auth_client.get("/api/v1/search/?q=needle")

    assert resp.status_code == 200
    assert resp.json() == {"cards": [], "boards": []}


@pytest.mark.django_db()
def test_search_requires_two_characters(auth_client: APIClient, column: Column) -> None:
    Card.objects.create(column=column, title="AB")

    resp = auth_client.get("/api/v1/search/?q=a")

    assert resp.status_code == 200
    assert resp.json() == {"cards": [], "boards": []}


@pytest.mark.django_db()
def test_search_requires_auth(api_client: APIClient) -> None:
    resp = api_client.get("/api/v1/search/?q=test")
    assert resp.status_code in {401, 403}
