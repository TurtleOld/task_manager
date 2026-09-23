from __future__ import annotations

from pathlib import Path

import pytest
from rest_framework.test import APIClient


@pytest.fixture()
def uploaded_file(tmp_path: Path, settings) -> Path:
    settings.MEDIA_ROOT = str(tmp_path)
    file_path = tmp_path / "attachment.txt"
    file_path.write_bytes(b"hello attachment")
    return file_path


def test_media_requires_authentication(api_client: APIClient, uploaded_file: Path) -> None:
    response = api_client.get(f"/media/{uploaded_file.name}")

    assert response.status_code in (401, 403)


def test_media_served_to_authenticated_user(auth_client: APIClient, uploaded_file: Path) -> None:
    response = auth_client.get(f"/media/{uploaded_file.name}")

    assert response.status_code == 200
    assert b"".join(response.streaming_content) == b"hello attachment"
