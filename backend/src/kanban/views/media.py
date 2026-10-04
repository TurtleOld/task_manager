from __future__ import annotations

import mimetypes
from urllib.parse import quote

from django.conf import settings
from django.http import Http404
from django.views.static import serve
from rest_framework.permissions import IsAuthenticated
from rest_framework.views import APIView

from ..models import Attachment

INLINE_CONTENT_TYPES = frozenset(
    {
        "image/jpeg",
        "image/png",
        "image/webp",
        "image/gif",
        "application/pdf",
    }
)
SANDBOX_EXEMPT_CONTENT_TYPES = frozenset({"application/pdf"})


class MediaView(APIView):
    """Serve an upload only when an Attachment row owns the requested path."""

    permission_classes = [IsAuthenticated]

    def get(self, request, path):
        attachment = Attachment.objects.filter(path=path).first()
        if attachment is None:
            raise Http404

        response = serve(request, path, document_root=settings.MEDIA_ROOT)

        content_type, _ = mimetypes.guess_type(path)
        disposition = "inline" if content_type in INLINE_CONTENT_TYPES else "attachment"
        filename = quote(attachment.name, safe="")
        response.headers["Content-Disposition"] = f"{disposition}; filename*=UTF-8''{filename}"
        return response

    def finalize_response(self, request, response, *args, **kwargs):
        response = super().finalize_response(request, response, *args, **kwargs)
        content_type = response.headers.get("Content-Type", "").split(";", 1)[0].strip().lower()
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["Cache-Control"] = "private, no-store"
        if content_type not in SANDBOX_EXEMPT_CONTENT_TYPES:
            response.headers["Content-Security-Policy"] = "sandbox"
        return response
