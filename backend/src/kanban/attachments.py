from __future__ import annotations

import logging
from collections.abc import Iterable

from django.core.files.storage import default_storage
from django.core.files.uploadedfile import UploadedFile
from django.db import transaction

from .models import Attachment

logger = logging.getLogger(__name__)

_HEIF_BRANDS = {b"heic", b"heix", b"hevc", b"hevx", b"mif1", b"msf1"}


def is_image(file: UploadedFile) -> bool:
    """Check the leading bytes: Content-Type of an upload is whatever the client claims."""
    file.seek(0)
    head = file.read(12)
    file.seek(0)
    return (
        head.startswith(b"\xff\xd8\xff")
        or head.startswith(b"\x89PNG\r\n\x1a\n")
        or head.startswith((b"GIF87a", b"GIF89a"))
        or (head[:4] == b"RIFF" and head[8:12] == b"WEBP")
        or (head[4:8] == b"ftyp" and head[8:12] in _HEIF_BRANDS)
    )


def discard_files_after_commit(paths: Iterable[str]) -> None:
    """Remove the files once no attachment points to them.

    Recurrence instances share one file between their attachment rows (ADR 0007),
    so a file outlives the row being deleted while any other row references it.
    """
    pending = {path for path in paths if path}
    if pending:
        transaction.on_commit(lambda: _delete_unreferenced(pending))


def _delete_unreferenced(paths: set[str]) -> None:
    referenced = set(Attachment.objects.filter(path__in=paths).values_list("path", flat=True))
    for path in paths - referenced:
        try:
            default_storage.delete(path)
        except Exception:  # noqa: BLE001
            logger.warning("Не удалось удалить файл вложения %s", path, exc_info=True)
