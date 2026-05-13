from __future__ import annotations

from datetime import timedelta

import pytest
from django.conf import settings
from django.utils import timezone
from rest_framework.test import APIClient

from kanban.models import Card, CardDeadlineReminder, NotificationProfile, RecurrenceFrequency, RecurrenceRule
from kanban.tasks import generate_recurring_cards


@pytest.mark.django_db()
def test_generate_recurring_cards_runs_every_minute() -> None:
    assert settings.CELERY_BEAT_SCHEDULE["generate-recurring-cards"]["schedule"] == 60.0


@pytest.mark.django_db()
def test_generated_recurring_card_does_not_get_own_recurrence(column) -> None:
    now = timezone.now()
    card = Card.objects.create(
        column=column,
        title="Recurring source",
        deadline=now - timedelta(minutes=1),
    )
    rule = RecurrenceRule.objects.create(
        card=card,
        freq=RecurrenceFrequency.DAILY,
        interval=1,
        next_due=now - timedelta(minutes=1),
    )

    generate_recurring_cards()

    generated = Card.objects.get(parent_recurrence=rule)
    assert not RecurrenceRule.objects.filter(card=generated).exists()
    rule.refresh_from_db()
    assert rule.generated_count == 1
    assert rule.next_due is not None


@pytest.mark.django_db()
def test_deadline_reminder_accepts_push_channel(
    auth_client: APIClient, regular_user, column
) -> None:
    card = Card.objects.create(
        column=column,
        title="Push reminder",
        deadline=timezone.now() + timedelta(hours=2),
    )
    NotificationProfile.objects.create(user=regular_user, onesignal_player_id="player-1")

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
    auth_client: APIClient, regular_user, card: Card
) -> None:
    NotificationProfile.objects.create(user=regular_user, onesignal_player_id="player-1")

    response = auth_client.get(f"/api/v1/cards/{card.id}/deadline-reminder/")

    assert response.status_code == 200
    assert "push" in response.json()["channels"]
