from __future__ import annotations

from pathlib import Path
from typing import Any
from urllib.parse import quote

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework.test import APIClient

from kanban.models import Attachment

JPEG_BYTES = b"\xff\xd8\xff\xe0\x00\x10JFIF\x00" + b"\x00" * 64


@pytest.fixture(autouse=True)
def media_root(tmp_path: Path, settings) -> None:
    settings.MEDIA_ROOT = str(tmp_path)


@pytest.fixture()
def card(auth_client: APIClient) -> dict[str, Any]:
    board = auth_client.post("/api/v1/boards/", data={"name": "B"}, format="json").json()
    return auth_client.post(
        "/api/v1/cards/",
        data={"board": board["id"], "title": "Чек"},
        format="json",
    ).json()


def upload(client: APIClient, card_id: int, file: SimpleUploadedFile, type_: str = "file"):
    return client.post(
        f"/api/v1/cards/{card_id}/attachments/",
        data={"type": type_, "files": [file]},
        format="multipart",
    )


@pytest.mark.django_db()
def test_file_over_the_limit_is_rejected_with_413(
    auth_client: APIClient, card: dict[str, Any], settings
) -> None:
    settings.ATTACHMENT_MAX_BYTES = 100
    resp = upload(auth_client, card["id"], SimpleUploadedFile("big.pdf", b"x" * 101))

    assert resp.status_code == 413
    assert "МБ" in resp.json()["detail"]
    assert auth_client.get(f"/api/v1/cards/{card['id']}/attachments/").json() == []


@pytest.mark.django_db()
def test_file_within_the_limit_is_attached(
    auth_client: APIClient, card: dict[str, Any], settings
) -> None:
    settings.ATTACHMENT_MAX_BYTES = 100
    resp = upload(auth_client, card["id"], SimpleUploadedFile("договор.pdf", b"x" * 100))

    assert resp.status_code == 201
    [attachment] = resp.json()["attachments"]
    assert attachment["type"] == "file"
    assert attachment["size"] == 100


@pytest.mark.django_db()
def test_uploaded_file_is_written_to_media_root(
    auth_client: APIClient, card: dict[str, Any], settings
) -> None:
    resp = upload(auth_client, card["id"], SimpleUploadedFile("договор.pdf", b"%PDF-1.4 body"))

    assert resp.status_code == 201
    attachment = Attachment.objects.get(card_id=card["id"])
    assert attachment.name == "договор.pdf"
    assert attachment.path.startswith(f"cards/{card['id']}/")
    assert attachment.url == f"/media/{quote(attachment.path, safe='/')}"
    on_disk = Path(settings.MEDIA_ROOT) / attachment.path
    assert on_disk.read_bytes() == b"%PDF-1.4 body"


@pytest.mark.django_db()
def test_photo_that_is_not_an_image_is_rejected(
    auth_client: APIClient, card: dict[str, Any]
) -> None:
    resp = upload(
        auth_client,
        card["id"],
        SimpleUploadedFile("photo.jpg", b"<html>evil</html>", content_type="image/jpeg"),
        type_="photo",
    )

    assert resp.status_code == 400
    assert "изображение" in resp.json()["detail"]
    assert auth_client.get(f"/api/v1/cards/{card['id']}/attachments/").json() == []


@pytest.mark.django_db()
def test_photo_with_image_bytes_is_attached(auth_client: APIClient, card: dict[str, Any]) -> None:
    resp = upload(auth_client, card["id"], SimpleUploadedFile("чек.jpg", JPEG_BYTES), "photo")

    assert resp.status_code == 201
    assert resp.json()["attachments"][0]["type"] == "photo"


@pytest.mark.django_db()
@pytest.mark.parametrize("type_", ["link", "video"])
def test_upload_with_unknown_type_is_rejected(
    auth_client: APIClient, card: dict[str, Any], type_: str
) -> None:
    resp = upload(auth_client, card["id"], SimpleUploadedFile("a.pdf", b"x"), type_=type_)

    assert resp.status_code == 400
    assert auth_client.get(f"/api/v1/cards/{card['id']}/attachments/").json() == []
