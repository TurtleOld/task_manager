import importlib

import pytest
from django.db import connection
from django.db.migrations.executor import MigrationExecutor

from kanban.models import Card, RecurrenceRule


@pytest.mark.django_db()
def test_backfill_restores_chains_without_guessing_or_overwriting(
    column, regular_user, admin_user
) -> None:
    source = Card.objects.create(column=column, title="Источник", created_by=regular_user)
    first_rule = RecurrenceRule.objects.create(card=source, freq="daily")
    first = Card.objects.create(column=column, title="Первый", parent_recurrence=first_rule)
    second_rule = RecurrenceRule.objects.create(card=first, freq="daily")
    second = Card.objects.create(column=column, title="Второй", parent_recurrence=second_rule)
    third_rule = RecurrenceRule.objects.create(card=second, freq="daily")
    known = Card.objects.create(
        column=column,
        title="С известным автором",
        parent_recurrence=third_rule,
        created_by=admin_user,
    )
    unknown = Card.objects.create(column=column, title="Неизвестный источник")
    unknown_rule = RecurrenceRule.objects.create(card=unknown, freq="daily")
    unknown_copy = Card.objects.create(
        column=column,
        title="Неизвестный повтор",
        parent_recurrence=unknown_rule,
        assignee=admin_user,
    )
    migration = importlib.import_module("kanban.migrations.0074_restore_recurring_card_creators")
    historical_apps = (
        MigrationExecutor(connection)
        .loader.project_state([("kanban", "0073_notificationdelivery_family_chat_and_more")])
        .apps
    )

    for _ in range(2):
        migration.restore_recurring_card_creators(historical_apps, connection.schema_editor())

    first.refresh_from_db()
    second.refresh_from_db()
    known.refresh_from_db()
    unknown.refresh_from_db()
    unknown_copy.refresh_from_db()
    assert first.created_by_id == regular_user.id
    assert second.created_by_id == regular_user.id
    assert known.created_by_id == admin_user.id
    assert unknown.created_by_id is None
    assert unknown_copy.created_by_id is None
