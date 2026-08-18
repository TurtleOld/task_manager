from __future__ import annotations

from datetime import timedelta

import pytest
from django.conf import settings
from django.utils import timezone
from rest_framework.test import APIClient

from kanban.models import (
    Card,
    CardDeadlineReminder,
    NotificationProfile,
    PushDevice,
    RecurrenceFrequency,
    RecurrenceRule,
)
from kanban.tasks import generate_recurring_cards


@pytest.mark.django_db()
def test_generate_recurring_cards_runs_every_minute() -> None:
    assert settings.CELERY_BEAT_SCHEDULE["generate-recurring-cards"]["schedule"] == 60.0


@pytest.mark.django_db()
def test_generated_recurring_card_receives_recurrence_and_source_stops(column) -> None:
    now = timezone.now()
    card = Card.objects.create(
        column=column,
        title="Recurring source",
        deadline=now - timedelta(minutes=1),
        completed_at=now,
    )
    rule = RecurrenceRule.objects.create(
        card=card,
        freq=RecurrenceFrequency.DAILY,
        interval=1,
        next_due=now - timedelta(minutes=1),
    )

    generate_recurring_cards()

    generated = Card.objects.get(parent_recurrence=rule)
    generated_rule = RecurrenceRule.objects.get(card=generated)
    assert generated_rule.freq == rule.freq
    assert generated_rule.interval == rule.interval
    assert generated_rule.generated_count == 1
    assert generated_rule.next_due is not None
    rule.refresh_from_db()
    assert rule.generated_count == 1
    assert rule.next_due is None


@pytest.mark.django_db()
def test_generation_held_while_instance_open(column) -> None:
    """No copy is created while the rule's own card is still open (not done)."""
    now = timezone.now()
    card = Card.objects.create(
        column=column,
        title="Recurring, still open",
        deadline=now - timedelta(minutes=1),
    )
    rule = RecurrenceRule.objects.create(
        card=card,
        freq=RecurrenceFrequency.DAILY,
        interval=1,
        next_due=now - timedelta(minutes=1),
    )

    generate_recurring_cards()

    assert Card.objects.filter(parent_recurrence=rule).count() == 0
    rule.refresh_from_db()
    assert rule.generated_count == 0
    assert rule.next_due is not None
    assert rule.next_due > now


@pytest.mark.django_db()
def test_generation_resumes_after_completion(column) -> None:
    """Completing the held instance lets the series generate its successor."""
    now = timezone.now()
    card = Card.objects.create(
        column=column,
        title="Recurring, still open",
        deadline=now - timedelta(minutes=1),
    )
    rule = RecurrenceRule.objects.create(
        card=card,
        freq=RecurrenceFrequency.DAILY,
        interval=1,
        next_due=now - timedelta(minutes=1),
    )

    generate_recurring_cards()  # held: card is open, no copy yet
    assert Card.objects.filter(parent_recurrence=rule).count() == 0

    card.completed_at = timezone.now()
    card.save(update_fields=["completed_at"])
    rule.refresh_from_db()
    rule.next_due = timezone.now() - timedelta(minutes=1)
    rule.save(update_fields=["next_due"])

    generate_recurring_cards()

    generated = Card.objects.get(parent_recurrence=rule)
    generated_rule = RecurrenceRule.objects.get(card=generated)
    rule.refresh_from_db()
    assert rule.generated_count == 1
    assert generated_rule.next_due is not None


@pytest.mark.django_db()
def test_deadline_reminder_accepts_push_channel(
    auth_client: APIClient, regular_user, column, settings
) -> None:
    card = Card.objects.create(
        column=column,
        title="Push reminder",
        deadline=timezone.now() + timedelta(hours=2),
    )
    NotificationProfile.objects.create(user=regular_user)
    # Push availability is now a property of registered devices, not of a
    # single token field on the profile.
    PushDevice.objects.create(
        user=regular_user,
        kind=PushDevice.Kind.FCM,
        token="fcm-token",
    )

    response = auth_client.put(
        f"/api/v1/cards/{card.id}/deadline-reminder/",
        data={
            "reminders": [
                {
                    "enabled": True,
                    "offset_value": 30,
                    "offset_unit": "minutes",
                    "channel": "push",
                }
            ]
        },
        format="json",
    )

    assert response.status_code == 200
    data = response.json()
    assert data[0]["channel"] == "push"
    assert data[0]["status"] == CardDeadlineReminder.Status.SCHEDULED


@pytest.mark.django_db()
def test_deadline_reminder_channels_include_push(
    auth_client: APIClient, regular_user, card: Card, settings
) -> None:
    NotificationProfile.objects.create(user=regular_user)
    # Push availability is now a property of registered devices, not of a
    # single token field on the profile.
    PushDevice.objects.create(
        user=regular_user,
        kind=PushDevice.Kind.FCM,
        token="fcm-token-2",
    )

    response = auth_client.get(f"/api/v1/cards/{card.id}/deadline-reminder/")

    assert response.status_code == 200
    assert "push" in response.json()["channels"]
