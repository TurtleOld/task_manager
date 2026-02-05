from __future__ import annotations

from django.http import JsonResponse
from django.urls import path


def health_view(_request):
    return JsonResponse({"status": "ok"})


urlpatterns = [
    path("health", health_view, name="health"),
]
