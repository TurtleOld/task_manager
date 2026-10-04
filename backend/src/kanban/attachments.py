from __future__ import annotations

from django.core.files.uploadedfile import UploadedFile

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
