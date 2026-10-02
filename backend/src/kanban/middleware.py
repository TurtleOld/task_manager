from __future__ import annotations

from collections.abc import Callable

from django.conf import settings
from django.http import HttpRequest, HttpResponse

from .session_engine import SessionStore


class SlidingSessionMiddleware:
    def __init__(self, get_response: Callable[[HttpRequest], HttpResponse]) -> None:
        self.get_response = get_response

    def __call__(self, request: HttpRequest) -> HttpResponse:
        extended = self._extend_if_due(request)
        response = self.get_response(request)
        if extended and not request.session.is_empty():
            self._refresh_cookie(request, response)
        return response

    def _extend_if_due(self, request: HttpRequest) -> bool:
        session = request.session
        if not isinstance(session, SessionStore) or session.session_key is None:
            return False
        if not request.user.is_authenticated or not session.is_extension_due():
            return False
        return session.extend()

    def _refresh_cookie(self, request: HttpRequest, response: HttpResponse) -> None:
        if settings.SESSION_COOKIE_NAME in response.cookies:
            return
        response.set_cookie(
            settings.SESSION_COOKIE_NAME,
            request.session.session_key,
            max_age=settings.SESSION_COOKIE_AGE,
            domain=settings.SESSION_COOKIE_DOMAIN,
            path=settings.SESSION_COOKIE_PATH,
            secure=settings.SESSION_COOKIE_SECURE or None,
            httponly=settings.SESSION_COOKIE_HTTPONLY or None,
            samesite=settings.SESSION_COOKIE_SAMESITE,
        )
