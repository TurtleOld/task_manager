from __future__ import annotations

from django.conf import settings
from django.contrib import admin
from django.urls import include, path
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView

from kanban.views.media import MediaView

urlpatterns = [
    path("admin/", admin.site.urls),
    # Health
    path("api/", include("kanban.health")),
    # API v1
    path("api/v1/", include("kanban.urls")),
    # OpenAPI schema and docs
    path("api/schema/", SpectacularAPIView.as_view(), name="schema"),
    path(
        "api/docs/",
        SpectacularSwaggerView.as_view(url_name="schema"),
        name="swagger-ui",
    ),
    # Attachments. Gated by IsAuthenticated in MediaView, not DEBUG.
    path(f"{settings.MEDIA_URL.strip('/')}/<path:path>", MediaView.as_view()),
]
