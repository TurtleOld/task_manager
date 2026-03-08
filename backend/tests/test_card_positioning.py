from __future__ import annotations

from decimal import Decimal

import pytest
from rest_framework.test import APIClient

from kanban.models import Board, Card, Column


def make_board_with_two_cols() -> tuple[Board, Column, Column]:
    board = Board.objects.create(name="B")
    col1 = Column.objects.create(board=board, name="Todo")
    col2 = Column.objects.create(board=board, name="Done")
    return board, col1, col2


# ---------------------------------------------------------------------------
# Position ordering
# ---------------------------------------------------------------------------


@pytest.mark.django_db()
def test_cards_ordered_by_position(api_client: APIClient) -> None:
    board, col, _ = make_board_with_two_cols()
    Card.objects.create(column=col, title="First", position=Decimal("1"))
    Card.objects.create(column=col, title="Second", position=Decimal("2"))
    Card.objects.create(column=col, title="Third", position=Decimal("3"))

    resp = api_client.get(f"/api/v1/cards/?column={col.id}")
    assert resp.status_code == 200
    titles = [c["title"] for c in resp.json()]
    assert titles == ["First", "Second", "Third"]


# ---------------------------------------------------------------------------
# Move to another column
# ---------------------------------------------------------------------------


@pytest.mark.django_db()
def test_move_card_to_another_column(api_client: APIClient) -> None:
    board, col1, col2 = make_board_with_two_cols()
    card = Card.objects.create(column=col1, title="Move me")

    resp = api_client.post(
        f"/api/v1/cards/{card.id}/move/",
        data={"to_column": col2.id},
        format="json",
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["column"] == col2.id
    assert data["board"] == board.id

    card.refresh_from_db()
    assert card.column_id == col2.id
    assert card.board_id == board.id


@pytest.mark.django_db()
def test_move_card_creates_card_moved_event(api_client: APIClient) -> None:
    from kanban.models import NotificationEvent

    board, col1, col2 = make_board_with_two_cols()
    card = Card.objects.create(column=col1, title="Mover")

    api_client.post(
        f"/api/v1/cards/{card.id}/move/",
        data={"to_column": col2.id},
        format="json",
    )
    assert NotificationEvent.objects.filter(event_type="card.moved", card_id=card.id).exists()


@pytest.mark.django_db()
def test_move_card_to_nonexistent_column(api_client: APIClient) -> None:
    board, col1, _ = make_board_with_two_cols()
    card = Card.objects.create(column=col1, title="X")

    resp = api_client.post(
        f"/api/v1/cards/{card.id}/move/",
        data={"to_column": 99999},
        format="json",
    )
    assert resp.status_code == 404


# ---------------------------------------------------------------------------
# Move with position hints (before_id / after_id)
# ---------------------------------------------------------------------------


@pytest.mark.django_db()
def test_move_between_specific_cards(api_client: APIClient) -> None:
    """after_id=A, before_id=B → new position between A.pos and B.pos (midpoint)."""
    board, col, _ = make_board_with_two_cols()
    c1 = Card.objects.create(column=col, title="A", position=Decimal("1"))
    c2 = Card.objects.create(column=col, title="B", position=Decimal("3"))
    c3 = Card.objects.create(column=col, title="C", position=Decimal("10"))

    # Move c3 between c1 (pos=1) and c2 (pos=3) → midpoint = 2
    resp = api_client.post(
        f"/api/v1/cards/{c3.id}/move/",
        data={"to_column": col.id, "after_id": c1.id, "before_id": c2.id},
        format="json",
    )
    assert resp.status_code == 200
    c3.refresh_from_db()
    # c3 position must be the midpoint of c1 and c2
    assert c1.position < c3.position < c2.position


@pytest.mark.django_db()
def test_move_with_only_after_id(api_client: APIClient) -> None:
    """after_id only → new_position = after.position - 1 (placed just before that card)."""
    board, col, _ = make_board_with_two_cols()
    c1 = Card.objects.create(column=col, title="A", position=Decimal("5"))
    c2 = Card.objects.create(column=col, title="B", position=Decimal("10"))

    resp = api_client.post(
        f"/api/v1/cards/{c1.id}/move/",
        data={"to_column": col.id, "after_id": c2.id},
        format="json",
    )
    assert resp.status_code == 200
    c1.refresh_from_db()
    # new position = c2.position - 1 = 9
    assert c1.position == c2.position - Decimal("1")


@pytest.mark.django_db()
def test_move_with_only_before_id(api_client: APIClient) -> None:
    """before_id only → new_position = before.position + 1 (placed just after that card)."""
    board, col, _ = make_board_with_two_cols()
    c1 = Card.objects.create(column=col, title="A", position=Decimal("2"))
    c2 = Card.objects.create(column=col, title="B", position=Decimal("5"))

    resp = api_client.post(
        f"/api/v1/cards/{c2.id}/move/",
        data={"to_column": col.id, "before_id": c1.id},
        format="json",
    )
    assert resp.status_code == 200
    c2.refresh_from_db()
    # new position = c1.position + 1 = 3
    assert c2.position == c1.position + Decimal("1")


# ---------------------------------------------------------------------------
# Optimistic version check on move
# ---------------------------------------------------------------------------


@pytest.mark.django_db()
def test_move_version_conflict(api_client: APIClient) -> None:
    board, col1, col2 = make_board_with_two_cols()
    card = Card.objects.create(column=col1, title="X")

    resp = api_client.post(
        f"/api/v1/cards/{card.id}/move/",
        data={"to_column": col2.id, "expected_version": card.version + 99},
        format="json",
    )
    assert resp.status_code == 409


@pytest.mark.django_db()
def test_move_with_correct_expected_version(api_client: APIClient) -> None:
    board, col1, col2 = make_board_with_two_cols()
    card = Card.objects.create(column=col1, title="X")

    resp = api_client.post(
        f"/api/v1/cards/{card.id}/move/",
        data={"to_column": col2.id, "expected_version": card.version},
        format="json",
    )
    assert resp.status_code == 200
