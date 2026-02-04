from __future__ import annotations

from django.urls import path
from django.http import JsonResponse


def health_view(_request):
    return JsonResponse({"status": "ok"})


urlpatterns = [
    path("health", health_view, name="health"),
]
