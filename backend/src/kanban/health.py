"""Health endpoints.

`/api/health` used to return `{"status": "ok"}` unconditionally, which made it
worse than useless: Docker's healthcheck reported a green container while the
notification pipeline had been silent for days. A check that cannot fail cannot
tell you anything.

Two endpoints, because they answer different questions:

  * `/api/health`  — is this process able to serve requests? Cheap, used by the
    container healthcheck. Fails only on things that make the process useless.
  * `/api/health/detail` — what exactly is degraded? Reports each dependency
    separately for humans and monitoring.
"""

from __future__ import annotations

from typing import Any

from django.conf import settings
from django.db import connection
from django.http import JsonResponse
from django.urls import path
from django.utils import timezone


def _check_database() -> dict[str, Any]:
    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1")
            cursor.fetchone()
    except Exception as exc:  # noqa: BLE001 - any failure is a failed check
        return {"ok": False, "error": str(exc)[:200]}
    return {"ok": True}


def _check_dispatcher() -> dict[str, Any]:
    """Is the notification dispatcher still running?

    Stale means "the loop has not completed a pass in several intervals". That
    covers the failure Docker cannot see: a process that is up but wedged.
    """

    from .models import DispatcherHeartbeat

    # Three missed passes, floored at two minutes, is late enough to be real
    # and loose enough not to flap on a slow tick.
    tolerance = max(120, settings.DISPATCHER_POLL_SECONDS * 3)

    try:
        heartbeat = DispatcherHeartbeat.objects.filter(name="dispatcher").first()
    except Exception as exc:  # noqa: BLE001
        return {"ok": False, "error": str(exc)[:200]}

    if heartbeat is None or heartbeat.last_tick_at is None:
        return {"ok": False, "error": "Диспетчер ещё ни разу не отработал"}

    age = (timezone.now() - heartbeat.last_tick_at).total_seconds()
    return {
        "ok": age <= tolerance,
        "last_tick_at": heartbeat.last_tick_at.isoformat(),
        "seconds_since_tick": int(age),
        "tolerance_seconds": tolerance,
        "ticks": heartbeat.ticks,
        "last_error": heartbeat.last_error,
    }


def _check_redis() -> dict[str, Any]:
    """Redis backs the websocket channel layer only.

    Deliberately reported as non-critical: losing it stops live list updates,
    it does not stop a single notification.
    """

    try:
        import redis

        client = redis.Redis.from_url(
            settings.REDIS_URL,
            socket_timeout=2,
            socket_connect_timeout=2,
        )
        client.ping()
    except Exception as exc:  # noqa: BLE001
        return {"ok": False, "critical": False, "error": str(exc)[:200]}
    return {"ok": True, "critical": False}


def _check_push() -> dict[str, Any]:
    from .models import PushDevice
    from .webpush import webpush_configured

    try:
        active_devices = PushDevice.objects.filter(active=True).count()
    except Exception as exc:  # noqa: BLE001
        return {"ok": False, "error": str(exc)[:200]}

    configured = webpush_configured()
    return {
        # Not having devices yet is a fresh install, not a fault.
        "ok": configured,
        "vapid_configured": configured,
        "active_devices": active_devices,
    }


def health_view(_request):
    """Liveness for the container healthcheck: can this process serve?"""

    database = _check_database()
    healthy = database["ok"]
    return JsonResponse(
        {"status": "ok" if healthy else "error", "database": database},
        status=200 if healthy else 503,
    )


def health_detail_view(_request):
    """Readiness detail: which dependency is degraded, and how badly."""

    checks = {
        "database": _check_database(),
        "dispatcher": _check_dispatcher(),
        "redis": _check_redis(),
        "push": _check_push(),
    }

    # A check marked `critical: False` may fail without failing the endpoint.
    critical_failures = [
        name
        for name, result in checks.items()
        if not result.get("ok") and result.get("critical", True)
    ]

    return JsonResponse(
        {
            "status": "ok" if not critical_failures else "degraded",
            "failing": critical_failures,
            "checks": checks,
        },
        status=200 if not critical_failures else 503,
    )


urlpatterns = [
    path("health", health_view, name="health"),
    path("health/detail", health_detail_view, name="health-detail"),
]
