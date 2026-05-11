from __future__ import annotations

import pytest
from rest_framework.test import APIClient

from kanban.models import Card, ChecklistItem, Column


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


@pytest.fixture()
def card_with_items(card: Card) -> Card:
    ChecklistItem.objects.create(card=card, text="Step 1", done=False, position=0)
    ChecklistItem.objects.create(card=card, text="Step 2", done=True, position=1)
    return card


# ---------------------------------------------------------------------------
# Card serializer includes checklist
# ---------------------------------------------------------------------------


@pytest.mark.django_db()
def test_card_detail_includes_checklist(api_client: APIClient, card_with_items: Card) -> None:
    resp = api_client.get(f"/api/v1/cards/{card_with_items.id}/")
    assert resp.status_code == 200
    checklist = resp.json()["checklist"]
    assert len(checklist) == 2
    assert checklist[0]["text"] == "Step 1"
    assert checklist[0]["done"] is False
    assert checklist[1]["text"] == "Step 2"
    assert checklist[1]["done"] is True
    assert isinstance(checklist[0]["id"], int)


@pytest.mark.django_db()
def test_card_detail_empty_checklist(api_client: APIClient, card: Card) -> None:
    resp = api_client.get(f"/api/v1/cards/{card.id}/")
    assert resp.status_code == 200
    assert resp.json()["checklist"] == []


# ---------------------------------------------------------------------------
# GET /cards/:id/checklist/
# ---------------------------------------------------------------------------


@pytest.mark.django_db()
def test_list_checklist_items(api_client: APIClient, card_with_items: Card) -> None:
    resp = api_client.get(f"/api/v1/cards/{card_with_items.id}/checklist/")
    assert resp.status_code == 200
    items = resp.json()
    assert len(items) == 2
    texts = [item["text"] for item in items]
    assert "Step 1" in texts
    assert "Step 2" in texts


# ---------------------------------------------------------------------------
# POST /cards/:id/checklist/
# ---------------------------------------------------------------------------


@pytest.mark.django_db()
def test_add_checklist_item(api_client: APIClient, card: Card) -> None:
    resp = api_client.post(
        f"/api/v1/cards/{card.id}/checklist/",
        data={"text": "Buy milk", "done": False},
        format="json",
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["text"] == "Buy milk"
    assert data["done"] is False
    assert isinstance(data["id"], int)
    assert ChecklistItem.objects.filter(card=card, text="Buy milk").exists()


@pytest.mark.django_db()
def test_add_checklist_item_sets_position(api_client: APIClient, card_with_items: Card) -> None:
    resp = api_client.post(
        f"/api/v1/cards/{card_with_items.id}/checklist/",
        data={"text": "Third item"},
        format="json",
    )
    assert resp.status_code == 201
    assert resp.json()["position"] == 2


@pytest.mark.django_db()
def test_add_checklist_item_broadcasts_card_update(api_client: APIClient, card: Card) -> None:
    resp = api_client.post(
        f"/api/v1/cards/{card.id}/checklist/",
        data={"text": "Check me"},
        format="json",
    )
    assert resp.status_code == 201


# ---------------------------------------------------------------------------
# PATCH /cards/:id/checklist/:item_id/
# ---------------------------------------------------------------------------


@pytest.mark.django_db()
def test_patch_checklist_item_done(api_client: APIClient, card_with_items: Card) -> None:
    item = ChecklistItem.objects.filter(card=card_with_items, text="Step 1").first()
    assert item is not None
    resp = api_client.patch(
        f"/api/v1/cards/{card_with_items.id}/checklist/{item.id}/",
        data={"done": True},
        format="json",
    )
    assert resp.status_code == 200
    assert resp.json()["done"] is True
    item.refresh_from_db()
    assert item.done is True


@pytest.mark.django_db()
def test_patch_checklist_item_text(api_client: APIClient, card_with_items: Card) -> None:
    item = ChecklistItem.objects.filter(card=card_with_items, text="Step 1").first()
    assert item is not None
    resp = api_client.patch(
        f"/api/v1/cards/{card_with_items.id}/checklist/{item.id}/",
        data={"text": "Updated step"},
        format="json",
    )
    assert resp.status_code == 200
    assert resp.json()["text"] == "Updated step"


@pytest.mark.django_db()
def test_patch_checklist_item_wrong_card(api_client: APIClient, column: Column, card_with_items: Card) -> None:
    other_card = Card.objects.create(column=column, title="Other card")
    item = ChecklistItem.objects.filter(card=card_with_items).first()
    assert item is not None
    resp = api_client.patch(
        f"/api/v1/cards/{other_card.id}/checklist/{item.id}/",
        data={"done": True},
        format="json",
    )
    assert resp.status_code == 404


# ---------------------------------------------------------------------------
# DELETE /cards/:id/checklist/:item_id/
# ---------------------------------------------------------------------------


@pytest.mark.django_db()
def test_delete_checklist_item(api_client: APIClient, card_with_items: Card) -> None:
    item = ChecklistItem.objects.filter(card=card_with_items, text="Step 1").first()
    assert item is not None
    resp = api_client.delete(f"/api/v1/cards/{card_with_items.id}/checklist/{item.id}/")
    assert resp.status_code == 204
    assert not ChecklistItem.objects.filter(id=item.id).exists()


@pytest.mark.django_db()
def test_delete_nonexistent_checklist_item(api_client: APIClient, card: Card) -> None:
    resp = api_client.delete(f"/api/v1/cards/{card.id}/checklist/99999/")
    assert resp.status_code == 404


# ---------------------------------------------------------------------------
# Migration: card no longer has JSON checklist field
# ---------------------------------------------------------------------------


@pytest.mark.django_db()
def test_card_patch_does_not_accept_checklist_field(api_client: APIClient, card: Card) -> None:
    resp = api_client.patch(
        f"/api/v1/cards/{card.id}/",
        data={"title": "OK", "checklist": [{"text": "ignored", "done": False}]},
        format="json",
    )
    # Should succeed (checklist is ignored in patch — it's read-only)
    assert resp.status_code == 200
    # But the item must NOT have been stored in ChecklistItem
    assert not ChecklistItem.objects.filter(card=card).exists()
