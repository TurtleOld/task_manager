from __future__ import annotations

from datetime import timedelta

import pytest
from axes.models import AccessAttempt
from django.contrib.auth import get_user_model
from django.core.cache import cache
from rest_framework.test import APIClient

User = get_user_model()

pytestmark = pytest.mark.django_db

LOGIN_URL = "/api/v1/auth/login/"
NGINX_ADDR = "172.18.0.5"
TRAEFIK_ADDR = "172.18.0.2"


@pytest.fixture(autouse=True)
def _fresh_cache() -> None:
    cache.clear()


@pytest.fixture()
def family_user() -> object:
    return User.objects.create_user(username="mom", password="correct-horse-42")


def _login(
    client: APIClient,
    password: str,
    *,
    client_ip: str = "203.0.113.7",
    spoofed: str | None = None,
    username: str = "mom",
):
    chain = [client_ip, TRAEFIK_ADDR]
    if spoofed:
        chain.insert(0, spoofed)
    return client.post(
        LOGIN_URL,
        data={"username": username, "password": password},
        format="json",
        REMOTE_ADDR=NGINX_ADDR,
        HTTP_X_FORWARDED_FOR=", ".join(chain),
    )


def test_spoofed_forwarded_for_does_not_reset_login_throttle(
    api_client: APIClient, family_user: object
) -> None:
    statuses = [
        _login(
            api_client,
            "guess",
            username=f"nobody{i}",
            spoofed=f"10.0.{i}.1",
        ).status_code
        for i in range(31)
    ]

    assert statuses[:30] == [401] * 30
    assert statuses[30] == 429


def test_login_throttle_is_per_real_client(
    api_client: APIClient,
    family_user: object,
) -> None:
    for i in range(30):
        _login(api_client, "guess", username=f"nobody{i}")

    resp = _login(api_client, "correct-horse-42", client_ip="198.51.100.9")

    assert resp.status_code == 200


def test_repeated_failures_lock_username_from_that_client(
    api_client: APIClient, family_user: object
) -> None:
    failures = [_login(api_client, "guess").status_code for _ in range(5)]
    resp = _login(api_client, "correct-horse-42")

    assert failures == [401, 401, 401, 401, 429]
    assert resp.status_code == 429
    assert "token" not in resp.json()


def test_lockout_does_not_affect_same_user_from_other_client(
    api_client: APIClient, family_user: object
) -> None:
    for _ in range(5):
        _login(api_client, "guess")

    resp = _login(api_client, "correct-horse-42", client_ip="198.51.100.9")

    assert resp.status_code == 200


def test_successful_login_resets_failure_counter(
    api_client: APIClient, family_user: object
) -> None:
    for _ in range(4):
        _login(api_client, "guess")
    assert _login(api_client, "correct-horse-42").status_code == 200

    for _ in range(4):
        _login(api_client, "guess")

    assert _login(api_client, "correct-horse-42").status_code == 200


def _age_attempts(minutes: int) -> None:
    for attempt in AccessAttempt.objects.all():
        attempt.attempt_time -= timedelta(minutes=minutes)
        attempt.save(update_fields=["attempt_time"])


def test_lockout_expires_an_hour_after_it_started(
    api_client: APIClient, family_user: object
) -> None:
    for _ in range(5):
        _login(api_client, "guess")
    _age_attempts(30)
    assert _login(api_client, "correct-horse-42").status_code == 429

    _age_attempts(31)

    assert _login(api_client, "correct-horse-42").status_code == 200


@pytest.mark.parametrize("password", ["1", "12345678", "password", "iloveyou"])
def test_first_user_registration_rejects_weak_password(
    api_client: APIClient, password: str
) -> None:
    resp = api_client.post(
        "/api/v1/auth/register/",
        data={"username": "mom", "password": password},
        format="json",
    )

    assert resp.status_code == 400
    assert "password" in resp.json()
    assert not User.objects.exists()
