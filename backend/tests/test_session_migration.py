from __future__ import annotations

import pytest
from django.db import connection
from django.db.migrations.executor import MigrationExecutor

BEFORE = [("kanban", "0063_user_session")]


def _migrate(targets: list[tuple[str, str]]) -> MigrationExecutor:
    executor = MigrationExecutor(connection)
    executor.migrate(targets)
    return executor


@pytest.mark.django_db(transaction=True)
def test_switch_to_sessions_drops_tokens_and_devices() -> None:
    old_apps = _migrate(BEFORE).loader.project_state(BEFORE).apps
    user = old_apps.get_model("auth", "User").objects.create(username="mom")
    old_apps.get_model("kanban", "PushDevice").objects.create(
        user=user, endpoint="https://push.example.com/a"
    )
    with connection.cursor() as cursor:
        cursor.execute(
            "CREATE TABLE authtoken_token (key varchar(40) PRIMARY KEY, user_id integer)"
        )
        cursor.execute("INSERT INTO authtoken_token VALUES ('secret', %s)", [user.pk])

    executor = MigrationExecutor(connection)
    leaves = executor.loader.graph.leaf_nodes()
    executor.migrate(leaves)

    new_apps = executor.loader.project_state(leaves).apps
    assert not new_apps.get_model("kanban", "PushDevice").objects.exists()
    assert "authtoken_token" not in connection.introspection.table_names()
