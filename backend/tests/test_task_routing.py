"""Guard the queue each task lands on.

`deliver_notification_event` once shipped without a route and silently fell
back to the default queue, so push delivery depended on a worker happening to
consume `celery` as well. These tests assert the routing the deployment relies
on, and fail when a newly added task is left unrouted.
"""

from __future__ import annotations

import pytest

from config.celery import app

# Every task that ends in something a user sees. Delivery must not share a
# queue with long housekeeping sweeps.
NOTIFICATION_TASKS = {
    "kanban.tasks.send_card_deadline_reminder",
    "kanban.tasks.send_notification_event",
    "kanban.tasks.deliver_notification_event",
    "kanban.tasks.send_overdue_card_reminders",
    "kanban.tasks.dispatch_due_reminders",
}

MAINTENANCE_TASKS = {
    "kanban.tasks.generate_recurring_cards",
    "kanban.tasks.process_inbox_schedules",
    "kanban.tasks.prune_card_activity",
}


def _queue_for(task_name: str) -> str:
    """Resolve the queue through Celery's own router, not the settings dict.

    Reading CELERY_TASK_ROUTES back would only compare the setting to itself
    and would miss a task that never reaches it.
    """
    return app.amqp.router.route({}, task_name)["queue"].name


@pytest.mark.parametrize("task_name", sorted(NOTIFICATION_TASKS))
def test_user_facing_tasks_use_notifications_queue(task_name: str) -> None:
    assert _queue_for(task_name) == "notifications"


@pytest.mark.parametrize("task_name", sorted(MAINTENANCE_TASKS))
def test_housekeeping_tasks_use_maintenance_queue(task_name: str) -> None:
    assert _queue_for(task_name) == "maintenance"


def test_every_kanban_task_is_routed_explicitly() -> None:
    """A task with no route falls back to a queue nothing may consume."""
    registered = {name for name in app.tasks if name.startswith("kanban.tasks.")}
    assert registered, "no kanban tasks registered — autodiscovery likely broke"

    unrouted = {name for name in registered if _queue_for(name) == app.conf.task_default_queue}
    assert not unrouted, (
        f"tasks fall back to the default queue: {sorted(unrouted)}. Add them to CELERY_TASK_ROUTES."
    )
