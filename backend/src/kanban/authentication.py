from __future__ import annotations

from typing import TYPE_CHECKING

from rest_framework import authentication, permissions
from rest_framework.request import Request

if TYPE_CHECKING:
    from rest_framework.views import APIView


class SessionAuthentication(authentication.SessionAuthentication):
    # Without a WWW-Authenticate scheme DRF answers a missing session with 403,
    # which the frontend could not tell apart from a CSRF or permission failure.
    def authenticate_header(self, request: Request) -> str:
        return "Session"


class CsrfProtected(permissions.BasePermission):
    """Require CSRF even from anonymous requests, which DRF otherwise exempts.

    Login and first-user registration open a session, so without this a
    foreign site could sign the browser into an account of its choosing.
    """

    def has_permission(self, request: Request, view: APIView) -> bool:
        SessionAuthentication().enforce_csrf(request)
        return True
