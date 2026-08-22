from __future__ import annotations

import io

import pytest
from django.contrib.auth import get_user_model
from django.core.management import call_command

from kanban.models import (
    Board,
    NotificationDelivery,
    NotificationEventType,
    PushDevice,
)
from kanban.notifications import create_notification_event

User = get_user_model()


@pytest.mark.django_db()
def test_run_dispatcher_once_works_without_a_listener() -> None:
    """SQLite has no LISTEN/NOTIFY; `--once` must still complete cleanly."""

    out = io.StringIO()
    call_command("run_dispatcher", "--once", stdout=out)
    assert "dispatcher tick" in out.getvalue()


@pytest.mark.django_db()
def test_notifications_doctor_runs_on_empty_database() -> None:
    out = io.StringIO()
    call_command("notifications_doctor", stdout=out)
    assert "Конфигурация" in out.getvalue()


@pytest.mark.django_db()
def test_notifications_doctor_runs_with_a_device_and_a_failed_delivery(
    regular_user: User, board: Board
) -> None:
    PushDevice.objects.create(
        user=regular_user,
        kind=PushDevice.Kind.WEBPUSH,
        endpoint="https://push.example.com/1",
        p256dh="p256dh-key",
        auth="auth-key",
    )
    event = create_notification_event(
        event_type=NotificationEventType.CARD_CREATED,
        actor=regular_user,
        board=board,
        summary="Создана задача",
    )
    NotificationDelivery.objects.create(
        event=event,
        user=regular_user,
        channel="push",
        status=NotificationDelivery.Status.FAILED,
        error="Subscription gone: HTTP 410",
    )

    out = io.StringIO()
    call_command("notifications_doctor", "--limit", "5", stdout=out)
    report = out.getvalue()
    assert "Устройства" in report
    assert "Последние доставки" in report
