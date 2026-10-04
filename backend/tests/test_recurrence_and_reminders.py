from __future__ import annotations

from datetime import timedelta

import pytest
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
from tests.auth_helpers import make_push_device


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
def test_deadline_reminder_schedules_without_explicit_channel(
    auth_client: APIClient, regular_user, column, settings
) -> None:
    card = Card.objects.create(
        column=column,
        title="Push reminder",
        deadline=timezone.now() + timedelta(hours=2),
    )
    NotificationProfile.objects.create(user=regular_user)
    # Push availability is a property of registered devices, not of a channel
    # field on the profile or the reminder.
    make_push_device(
        regular_user,
        kind=PushDevice.Kind.WEBPUSH,
        endpoint="https://push.example.com/a",
    )

    response = auth_client.put(
        f"/api/v1/cards/{card.id}/deadline-reminder/",
        data={
            "reminders": [
                {
                    "enabled": True,
                    "offset_value": 30,
                    "offset_unit": "minutes",
                }
            ]
        },
        format="json",
    )

    assert response.status_code == 200
    data = response.json()
    assert data[0]["status"] == CardDeadlineReminder.Status.SCHEDULED


@pytest.mark.django_db()
def test_deadline_reminder_channels_include_push(
    auth_client: APIClient, regular_user, card: Card, settings
) -> None:
    NotificationProfile.objects.create(user=regular_user)
    make_push_device(
        regular_user,
        kind=PushDevice.Kind.WEBPUSH,
        endpoint="https://push.example.com/b",
    )

    response = auth_client.get(f"/api/v1/cards/{card.id}/deadline-reminder/")

    assert response.status_code == 200
    channels = response.json()["channels"]
    assert channels["push"]["available"] is True


@pytest.mark.django_db()
def test_deadline_reminder_without_devices_reports_no_devices(
    auth_client: APIClient, regular_user, card: Card, settings
) -> None:
    NotificationProfile.objects.create(user=regular_user)

    response = auth_client.get(f"/api/v1/cards/{card.id}/deadline-reminder/")

    assert response.status_code == 200
    channels = response.json()["channels"]
    assert channels["push"]["available"] is False
    assert "устройств" in channels["push"]["reason"].lower()


def _two_instance_series(column) -> tuple[Card, RecurrenceRule, Card]:
    """A completed first instance whose successor is already open."""
    now = timezone.now()
    first = Card.objects.create(
        column=column,
        title="Series",
        deadline=now - timedelta(days=1),
        completed_at=now - timedelta(hours=1),
    )
    first_rule = RecurrenceRule.objects.create(
        card=first, freq=RecurrenceFrequency.DAILY, interval=1, generated_count=1
    )
    current = Card.objects.create(
        column=column,
        title="Series",
        deadline=now + timedelta(days=1),
        parent_recurrence=first_rule,
    )
    RecurrenceRule.objects.create(
        card=current,
        freq=RecurrenceFrequency.DAILY,
        interval=1,
        generated_count=1,
        next_due=current.deadline,
    )
    return first, first_rule, current


_RULE_PAYLOAD = {"freq": "daily", "interval": 2}


@pytest.mark.django_db()
def test_put_recurrence_on_stale_instance_is_rejected(auth_client: APIClient, column) -> None:
    first, first_rule, current = _two_instance_series(column)

    response = auth_client.put(
        f"/api/v1/cards/{first.pk}/recurrence/", _RULE_PAYLOAD, format="json"
    )

    assert response.status_code == 409
    assert response.json()["current_card_id"] == current.pk
    first_rule.refresh_from_db()
    assert first_rule.next_due is None
    assert first_rule.interval == 1


@pytest.mark.django_db()
def test_delete_recurrence_on_stale_instance_is_rejected(auth_client: APIClient, column) -> None:
    first, first_rule, _ = _two_instance_series(column)

    response = auth_client.delete(f"/api/v1/cards/{first.pk}/recurrence/")

    assert response.status_code == 409
    assert RecurrenceRule.objects.filter(pk=first_rule.pk).exists()


@pytest.mark.django_db()
def test_put_recurrence_on_current_instance_is_allowed(auth_client: APIClient, column) -> None:
    _, _, current = _two_instance_series(column)

    response = auth_client.put(
        f"/api/v1/cards/{current.pk}/recurrence/", _RULE_PAYLOAD, format="json"
    )

    assert response.status_code == 200
    assert response.json()["interval"] == 2


@pytest.mark.django_db()
def test_exhausted_series_can_be_resumed_on_its_last_instance(
    auth_client: APIClient, column
) -> None:
    now = timezone.now()
    last = Card.objects.create(
        column=column, title="Done", deadline=now - timedelta(days=1), completed_at=now
    )
    RecurrenceRule.objects.create(
        card=last, freq=RecurrenceFrequency.DAILY, interval=1, count=3, generated_count=3
    )

    response = auth_client.put(
        f"/api/v1/cards/{last.pk}/recurrence/", {**_RULE_PAYLOAD, "count": None}, format="json"
    )

    assert response.status_code == 200


@pytest.mark.django_db()
def test_get_recurrence_reports_current_instance(auth_client: APIClient, column) -> None:
    first, _, current = _two_instance_series(column)

    stale = auth_client.get(f"/api/v1/cards/{first.pk}/recurrence/").json()
    live = auth_client.get(f"/api/v1/cards/{current.pk}/recurrence/").json()

    assert stale["is_current"] is False
    assert stale["current_card_id"] == current.pk
    assert live["is_current"] is True
    assert live["current_card_id"] == current.pk


@pytest.mark.django_db()
def test_generator_does_not_fork_series_from_rearmed_stale_rule(column) -> None:
    first, first_rule, current = _two_instance_series(column)
    first_rule.next_due = timezone.now() - timedelta(minutes=1)
    first_rule.save(update_fields=["next_due"])

    generate_recurring_cards()

    assert Card.objects.filter(parent_recurrence=first_rule).count() == 1
    assert Card.objects.count() == 2
    first_rule.refresh_from_db()
    assert first_rule.next_due is None
    assert first_rule.generated_count == 1
