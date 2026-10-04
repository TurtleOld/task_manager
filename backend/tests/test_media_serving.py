from __future__ import annotations

from pathlib import Path
from urllib.parse import quote

import pytest
from rest_framework.test import APIClient

from kanban.models import Attachment

INLINE = "inline"
ATTACHMENT = "attachment"


@pytest.fixture(autouse=True)
def media_root(tmp_path: Path, settings) -> Path:
    settings.MEDIA_ROOT = str(tmp_path)
    return tmp_path


@pytest.fixture()
def make_attachment(card, media_root: Path):
    def _make(name: str, data: bytes = b"payload") -> Attachment:
        attachment = Attachment.objects.create(card=card, name=name)
        storage_path = f"cards/{card.id}/{attachment.id}-{name}"
        full_path = media_root / storage_path
        full_path.parent.mkdir(parents=True, exist_ok=True)
        full_path.write_bytes(data)
        attachment.path = storage_path
        attachment.save(update_fields=["path"])
        return attachment

    return _make


def media_url(attachment: Attachment) -> str:
    return f"/media/{attachment.path}"


def test_media_requires_authentication(api_client: APIClient, make_attachment) -> None:
    attachment = make_attachment("secret.txt")

    response = api_client.get(media_url(attachment))

    assert response.status_code == 401
    assert response["X-Content-Type-Options"] == "nosniff"
    assert response["Cache-Control"] == "private, no-store"


def test_media_served_to_authenticated_session(auth_client: APIClient, make_attachment) -> None:
    attachment = make_attachment("attachment.txt", b"hello attachment")

    response = auth_client.get(media_url(attachment))

    assert response.status_code == 200
    assert b"".join(response.streaming_content) == b"hello attachment"


def test_media_is_not_served_without_attachment_record(
    auth_client: APIClient, media_root: Path
) -> None:
    path = "cards/1/orphan.html"
    full_path = media_root / path
    full_path.parent.mkdir(parents=True)
    full_path.write_bytes(b"<html>no attachment row</html>")

    response = auth_client.get(f"/media/{path}")

    assert response.status_code == 404
    assert response["X-Content-Type-Options"] == "nosniff"
    assert response["Cache-Control"] == "private, no-store"


@pytest.mark.parametrize(
    ("name", "disposition", "sandboxed"),
    [
        ("photo.jpeg", INLINE, True),
        ("photo.jpg", INLINE, True),
        ("image.png", INLINE, True),
        ("image.webp", INLINE, True),
        ("image.gif", INLINE, True),
        ("document.pdf", INLINE, False),
        ("vector.svg", ATTACHMENT, True),
        ("page.html", ATTACHMENT, True),
        ("archive.zip", ATTACHMENT, True),
        ("photo.heic", ATTACHMENT, True),
    ],
)
def test_disposition_csp_and_cache_headers(
    auth_client: APIClient, make_attachment, name: str, disposition: str, sandboxed: bool
) -> None:
    attachment = make_attachment(name)

    response = auth_client.get(media_url(attachment))

    assert response.status_code == 200
    expected_name = quote(name, safe="")
    assert response["Content-Disposition"] == f"{disposition}; filename*=UTF-8''{expected_name}"
    assert response["X-Content-Type-Options"] == "nosniff"
    assert response["Cache-Control"] == "private, no-store"
    if sandboxed:
        assert response["Content-Security-Policy"] == "sandbox"
    else:
        assert "Content-Security-Policy" not in response


def test_content_disposition_uses_attachment_name(auth_client: APIClient, make_attachment) -> None:
    attachment = make_attachment("договор.pdf")

    response = auth_client.get(media_url(attachment))

    expected = quote(attachment.name, safe="")
    assert response["Content-Disposition"] == f"inline; filename*=UTF-8''{expected}"
