from __future__ import annotations

import json

import pytest
from django.test import Client


@pytest.mark.django_db()
def test_health_ok(client: Client) -> None:
    """Liveness passes when the database answers."""

    resp = client.get("/api/health")
    assert resp.status_code == 200
    data = json.loads(resp.content)
    assert data["status"] == "ok"
    assert data["database"]["ok"] is True


@pytest.mark.django_db()
def test_health_detail_reports_dead_dispatcher(client: Client) -> None:
    """A dispatcher that has never ticked must make the endpoint fail.

    This is the whole point of the check: silence used to be indistinguishable
    from health, so a stopped dispatcher went unnoticed for days.
    """

    resp = client.get("/api/health/detail")

    assert resp.status_code == 503
    data = json.loads(resp.content)
    assert data["status"] == "degraded"
    assert "dispatcher" in data["failing"]


@pytest.mark.django_db()
def test_health_detail_passes_with_a_fresh_heartbeat(client: Client) -> None:
    from kanban.dispatcher import beat

    beat()

    resp = client.get("/api/health/detail")

    data = json.loads(resp.content)
    assert data["checks"]["dispatcher"]["ok"] is True
    assert "dispatcher" not in data["failing"]


@pytest.mark.django_db()
def test_health_detail_fails_when_the_last_tick_errored(client: Client) -> None:
    """A fresh heartbeat with a recorded error must not read as healthy.

    `tick()` beats on every pass, even a failing one, so freshness alone
    cannot tell a wedged job from a working one.
    """

    from kanban.dispatcher import beat

    beat(error="db went away")

    resp = client.get("/api/health/detail")

    assert resp.status_code == 503
    data = json.loads(resp.content)
    assert data["checks"]["dispatcher"]["ok"] is False
    assert "dispatcher" in data["failing"]


@pytest.mark.django_db()
def test_health_detail_fails_when_maintenance_is_failing(client: Client) -> None:
    from kanban.dispatcher import beat
    from kanban.models import DispatcherHeartbeat

    beat()
    DispatcherHeartbeat.objects.filter(name="dispatcher").update(
        last_maintenance_error="recurrence exploded"
    )

    resp = client.get("/api/health/detail")

    assert resp.status_code == 503
    data = json.loads(resp.content)
    assert data["checks"]["dispatcher"]["ok"] is False
    assert "dispatcher" in data["failing"]


@pytest.mark.django_db()
def test_health_detail_reports_queue_depth(client: Client) -> None:
    from kanban.dispatcher import beat

    beat()

    resp = client.get("/api/health/detail")
    data = json.loads(resp.content)

    assert data["checks"]["queue"]["ok"] is True
    assert "pending" in data["checks"]["queue"]
    assert "failed" in data["checks"]["queue"]


@pytest.mark.django_db()
def test_health_detail_tolerates_missing_redis(client: Client, settings) -> None:
    """Redis backs websockets only; losing it must not fail the endpoint."""

    settings.REDIS_URL = "redis://127.0.0.1:1/0"
    from kanban.dispatcher import beat

    beat()

    resp = client.get("/api/health/detail")
    data = json.loads(resp.content)

    assert data["checks"]["redis"]["ok"] is False
    assert "redis" not in data["failing"]
