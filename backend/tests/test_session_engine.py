from __future__ import annotations

import subprocess
import sys
from datetime import datetime, timedelta
from pathlib import Path

import pytest
from django.contrib.auth import get_user_model
from django.test import Client
from django.utils import timezone

from kanban.models import UserSession
from kanban.session_engine import SessionStore
from kanban.user_agent import UNKNOWN_LABEL, label_from_user_agent

pytestmark = pytest.mark.django_db

User = get_user_model()

ANDROID_CHROME = (
    "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36"
)


@pytest.fixture
def staff() -> User:
    return User.objects.create_superuser("root", "root@example.com", "pw12345!")


def admin_login(staff: User, user_agent: str = ANDROID_CHROME) -> Client:
    client = Client(HTTP_USER_AGENT=user_agent)
    response = client.post(
        "/admin/login/",
        {"username": staff.username, "password": "pw12345!", "next": "/admin/"},
    )
    assert response.status_code == 302
    return client


def logged_in_session() -> UserSession:
    return UserSession.objects.get(user__isnull=False)


def freeze_now(monkeypatch: pytest.MonkeyPatch, moment: datetime) -> None:
    monkeypatch.setattr("django.utils.timezone.now", lambda: moment)


def test_admin_login_creates_session_with_user_label_and_login_time(
    staff: User,
) -> None:
    before = timezone.now()
    admin_login(staff)

    session = logged_in_session()
    assert session.user_id == staff.id
    assert session.user_agent_label == "Chrome на Android"
    assert before <= session.login_at <= timezone.now()


def test_request_within_a_day_does_not_write_sessions(staff: User) -> None:
    client = admin_login(staff)
    stamp = logged_in_session().last_activity

    client.get("/admin/")

    assert logged_in_session().last_activity == stamp


def test_request_after_a_day_extends_expiry_and_activity(
    staff: User, monkeypatch: pytest.MonkeyPatch
) -> None:
    client = admin_login(staff)
    session = logged_in_session()
    login_at = session.login_at
    later = timezone.now() + timedelta(days=2)
    freeze_now(monkeypatch, later)

    response = client.get("/admin/")

    assert response.status_code == 200
    session = logged_in_session()
    assert session.last_activity == later
    assert session.expire_date == later + timedelta(days=90)
    assert session.login_at == login_at
    assert client.cookies["sessionid"]["max-age"] == 90 * 24 * 60 * 60


def test_session_idle_for_ninety_days_does_not_authenticate(
    staff: User, monkeypatch: pytest.MonkeyPatch
) -> None:
    client = admin_login(staff)
    freeze_now(monkeypatch, timezone.now() + timedelta(days=91))

    response = client.get("/admin/")

    assert response.status_code == 302
    assert "/admin/login/" in response["Location"]


def test_session_survives_ninety_days_when_used_regularly(
    staff: User, monkeypatch: pytest.MonkeyPatch
) -> None:
    client = admin_login(staff)
    start = timezone.now()
    for day in range(2, 200, 2):
        freeze_now(monkeypatch, start + timedelta(days=day))
        assert client.get("/admin/").status_code == 200


def test_session_cookie_flags(staff: User) -> None:
    client = admin_login(staff)

    cookie = client.cookies["sessionid"]
    assert cookie["httponly"]
    assert cookie["samesite"] == "Lax"


def test_session_cookie_is_secure_outside_debug() -> None:
    code = (
        "import os; os.environ['DJANGO_DEBUG']='false';"
        "os.environ['DJANGO_SECRET_KEY']='x';"
        "os.environ.setdefault('DJANGO_ALLOWED_HOSTS','localhost');"
        "from config import settings as s;"
        "print(s.SESSION_COOKIE_SECURE, s.CSRF_COOKIE_SECURE)"
    )
    out = subprocess.run(
        [sys.executable, "-c", code],
        capture_output=True,
        text=True,
        cwd=Path(__file__).resolve().parents[1] / "src",
    )
    assert out.stdout.strip().endswith("True True"), out.stderr


@pytest.mark.parametrize(
    ("user_agent", "label"),
    [
        (ANDROID_CHROME, "Chrome на Android"),
        (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
            "(KHTML, like Gecko) Chrome/126.0 Safari/537.36 Edg/126.0",
            "Edge на Windows",
        ),
        (
            "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) "
            "AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 "
            "Mobile/15E148 Safari/604.1",
            "Safari на iOS",
        ),
        (
            "Mozilla/5.0 (X11; Linux x86_64; rv:127.0) Gecko/20100101 Firefox/127.0",
            "Firefox на Linux",
        ),
        ("", UNKNOWN_LABEL),
    ],
)
def test_user_agent_label(user_agent: str, label: str) -> None:
    assert label_from_user_agent(user_agent) == label


def test_login_time_is_the_login_not_the_anonymous_session(
    staff: User, monkeypatch: pytest.MonkeyPatch
) -> None:
    client = Client()
    start = timezone.now()
    freeze_now(monkeypatch, start)
    client.get("/admin/login/")
    session = client.session
    session["anonymous"] = True
    session.save()
    login_time = start + timedelta(hours=3)
    freeze_now(monkeypatch, login_time)

    client.force_login(staff)

    assert logged_in_session().login_at == login_time


def test_concurrent_extension_is_not_rolled_back_by_a_stale_save(
    staff: User, monkeypatch: pytest.MonkeyPatch
) -> None:
    client = admin_login(staff)
    stale = SessionStore(client.cookies["sessionid"].value)
    stale["touched"] = True
    later = timezone.now() + timedelta(days=2)
    freeze_now(monkeypatch, later)
    client.get("/admin/")

    stale.save()

    assert logged_in_session().last_activity == later


def test_session_without_a_cookie_is_not_loaded(staff: User) -> None:
    response = Client().get("/admin/login/")

    assert "sessionid" not in response.cookies
