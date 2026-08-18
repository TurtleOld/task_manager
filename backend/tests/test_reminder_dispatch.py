from __future__ import annotations

from datetime import timedelta

import pytest
from django.utils import timezone

from kanban.models import Card, CardDeadlineReminder, NotificationProfile, PushDevice
from kanban.reminders import upsert_and_schedule_reminder


@pytest.mark.django_db()
def test_scheduling_does_not_use_broker_eta(column, regular_user) -> None:
    """The regression this whole change is about: no broker message is created."""
    now = timezone.now()
    NotificationProfile.objects.update_or_create(user=regular_user, defaults={})
    PushDevice.objects.create(
        user=regular_user, kind=PushDevice.Kind.WEBPUSH, endpoint="https://push.example.com/a"
    )
    card = Card.objects.create(
        column=column,
        title="Far future",
        deadline=now + timedelta(days=30),
    )
    reminder = CardDeadlineReminder.objects.create(
        card=card,
        user=regular_user,
        enabled=True,
        offset_value=20,
    )

    upsert_and_schedule_reminder(card=card, reminder=reminder)

    reminder.refresh_from_db()
    assert reminder.status == CardDeadlineReminder.Status.SCHEDULED
    assert reminder.scheduled_at is not None


@pytest.mark.django_db()
def test_scheduling_without_devices_yields_no_devices_status(column, regular_user) -> None:
    """With a single channel, "available" means "has an active device"."""
    NotificationProfile.objects.update_or_create(user=regular_user, defaults={})
    now = timezone.now()
    card = Card.objects.create(
        column=column,
        title="No devices",
        deadline=now + timedelta(days=1),
    )
    reminder = CardDeadlineReminder.objects.create(
        card=card,
        user=regular_user,
        enabled=True,
        offset_value=20,
    )

    upsert_and_schedule_reminder(card=card, reminder=reminder)

    reminder.refresh_from_db()
    assert reminder.status == CardDeadlineReminder.Status.INVALID_CHANNEL
    assert "устройств" in reminder.last_error.lower()


@pytest.mark.django_db()
def test_scheduling_without_deadline_yields_no_deadline_status(column, regular_user) -> None:
    NotificationProfile.objects.update_or_create(user=regular_user, defaults={})
    PushDevice.objects.create(user=regular_user, kind=PushDevice.Kind.WEBPUSH, endpoint="https://push.example.com/a")
    card = Card.objects.create(column=column, title="No deadline", deadline=None)
    reminder = CardDeadlineReminder.objects.create(
        card=card,
        user=regular_user,
        enabled=True,
        offset_value=20,
    )

    upsert_and_schedule_reminder(card=card, reminder=reminder)

    reminder.refresh_from_db()
    assert reminder.status == CardDeadlineReminder.Status.INVALID_NO_DEADLINE
