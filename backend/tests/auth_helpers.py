from __future__ import annotations

from datetime import timedelta

from django.conf import settings
from django.utils import timezone
from django.utils.crypto import get_random_string
from rest_framework.test import APIClient

from kanban.models import PushDevice, UserSession

CSRF_URL = "/api/v1/auth/csrf/"
LOGIN_URL = "/api/v1/auth/login/"


def csrf_client(**defaults: str) -> APIClient:
    client = APIClient(enforce_csrf_checks=True, **defaults)
    client.get(CSRF_URL)
    return client


def csrf_token(client: APIClient) -> str:
    return client.cookies[settings.CSRF_COOKIE_NAME].value


def login_client(username: str, password: str, **defaults: str) -> APIClient:
    client = csrf_client(**defaults)
    response = client.post(
        LOGIN_URL,
        data={"username": username, "password": password},
        format="json",
        HTTP_X_CSRFTOKEN=csrf_token(client),
    )
    assert response.status_code == 200, response.content
    client.credentials(HTTP_X_CSRFTOKEN=csrf_token(client))
    return client


def client_for(user: object) -> APIClient:
    client = csrf_client()
    client.force_login(user)
    client.credentials(HTTP_X_CSRFTOKEN=csrf_token(client))
    return client


def session_key(client: APIClient) -> str:
    return client.cookies[settings.SESSION_COOKIE_NAME].value


def make_session(user: object) -> UserSession:
    now = timezone.now()
    return UserSession.objects.create(
        session_key=get_random_string(32),
        session_data="",
        expire_date=now + timedelta(seconds=settings.SESSION_COOKIE_AGE),
        user=user,
    )


def make_push_device(user: object, **fields: object) -> PushDevice:
    if "session" not in fields:
        fields["session"] = make_session(user)
    return PushDevice.objects.create(user=user, **fields)
