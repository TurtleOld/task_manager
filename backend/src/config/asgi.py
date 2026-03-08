from __future__ import annotations

import os

from channels.routing import ProtocolTypeRouter, URLRouter
from channels.security.websocket import AllowedHostsOriginValidator
from django.core.asgi import get_asgi_application
from django.urls import path

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")

# Initialize Django ASGI application early to ensure the AppRegistry is
# populated before importing code that may trigger model lookups.
django_asgi_app = get_asgi_application()

from kanban.consumers import BoardConsumer  # noqa: E402  (must be after setup)

websocket_urlpatterns = [
    path("ws/boards/<int:board_id>/", BoardConsumer.as_asgi()),
]

application = ProtocolTypeRouter(
    {
        "http": django_asgi_app,
        "websocket": AllowedHostsOriginValidator(
            URLRouter(websocket_urlpatterns)
        ),
    }
)
