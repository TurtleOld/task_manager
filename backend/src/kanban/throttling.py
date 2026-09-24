from __future__ import annotations

import os

from django.http import HttpRequest
from rest_framework.throttling import AnonRateThrottle, BaseThrottle


def client_ip(request: HttpRequest) -> str | None:
    """Client address behind the proxy chain, as DRF throttles see it.

    Shared with django-axes so lockouts and throttles key on the same
    address that honours REST_FRAMEWORK["NUM_PROXIES"].
    """
    return BaseThrottle().get_ident(request)


class LoginRateThrottle(AnonRateThrottle):
    # Anon-keyed, so users behind the same NAT/proxy share the bucket;
    # axes (username + IP) is what actually stops brute-forcing one account.
    # Set directly (not via DEFAULT_THROTTLE_RATES) so tests that blank
    # that setting to disable throttling globally don't disable this too.
    scope = "login"
    rate = os.getenv("DRF_THROTTLE_LOGIN_RATE", "30/min")
