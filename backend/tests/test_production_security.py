from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path
from urllib.parse import urlsplit

import pytest
from django.conf import settings
from django.test import RequestFactory

from config import settings as project_settings

BACKEND_DIR = Path(__file__).resolve().parents[1]
PRODUCTION_SECRET_KEY = "test-production-key-0123456789-ABCDEFGHIJ-abcdefghij"


def _run_deploy_check(*, debug: bool) -> str:
    env = {
        "PATH": os.environ.get("PATH", ""),
        "HOME": os.environ.get("HOME", ""),
        "DJANGO_SECRET_KEY": PRODUCTION_SECRET_KEY,
        "DJANGO_DEBUG": "true" if debug else "false",
        "DJANGO_ALLOWED_HOSTS": "tasks.example.com",
        "FRONTEND_BASE_URL": "https://tasks.example.com",
        "DATABASE_URL": "sqlite:///:memory:",
    }
    result = subprocess.run(
        [sys.executable, "manage.py", "check", "--deploy"],
        cwd=BACKEND_DIR,
        env=env,
        capture_output=True,
        text=True,
    )
    return result.stdout + result.stderr


def test_forwarded_proto_marks_request_secure() -> None:
    request = RequestFactory().get("/", HTTP_X_FORWARDED_PROTO="https")

    assert request.is_secure() is True


def test_frontend_origin_is_trusted_for_csrf() -> None:
    parsed = urlsplit(settings.FRONTEND_BASE_URL)
    expected = f"{parsed.scheme}://{parsed.netloc}"

    assert expected in settings.CSRF_TRUSTED_ORIGINS


def test_env_list_splits_and_strips(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv(
        "DJANGO_TEST_ORIGINS",
        " https://a.example.com , https://b.example.com ,",
    )

    assert project_settings._env_list("DJANGO_TEST_ORIGINS") == [
        "https://a.example.com",
        "https://b.example.com",
    ]


def test_origin_ignores_paths_and_invalid_urls() -> None:
    assert project_settings._origin("https://tasks.example.com/admin/") == (
        "https://tasks.example.com"
    )
    assert project_settings._origin("not-a-url") == ""


def test_deploy_check_has_no_insecure_cookie_warnings() -> None:
    output = _run_deploy_check(debug=False)

    assert "security.W012" not in output, output
    assert "security.W016" not in output, output
    assert "security.W018" not in output, output


def test_deploy_check_warns_about_insecure_cookies_in_debug() -> None:
    output = _run_deploy_check(debug=True)

    assert "security.W012" in output, output
    assert "security.W016" in output, output
