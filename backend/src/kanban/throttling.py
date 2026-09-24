from __future__ import annotations

from django.http import HttpRequest
from rest_framework.throttling import AnonRateThrottle, BaseThrottle


def client_ip(request: HttpRequest) -> str | None:
    """Client address behind the proxy chain, as DRF throttles see it.

    Shared with django-axes so lockouts and throttles key on the same
    address that honours REST_FRAMEWORK["NUM_PROXIES"].
    """
    return BaseThrottle().get_ident(request)


class LoginRateThrottle(AnonRateThrottle):
    scope = "login"
    rate = "10/min"
