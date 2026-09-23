from __future__ import annotations

from django.conf import settings
from django.views.static import serve
from rest_framework.permissions import IsAuthenticated
from rest_framework.views import APIView


class MediaView(APIView):
    """Serve uploaded attachments, gated the same way as the rest of the API.

    ``django.views.static.serve`` is normally only wired up under
    ``DEBUG=True``; in production nothing else in this repo serves
    ``MEDIA_URL``, so we wire it up ourselves behind auth instead of the
    open-to-DEBUG shortcut.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request, path):
        return serve(request, path, document_root=settings.MEDIA_ROOT)
