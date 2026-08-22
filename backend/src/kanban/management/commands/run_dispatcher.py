"""Run the notification dispatcher loop.

Replaces `celery worker` + `celery beat`. One process, one database, no broker
in the path a notification has to travel.

    python manage.py run_dispatcher

`--once` runs a single pass and exits, which is what tests and manual pokes
want. `--no-maintenance` skips recurring-card generation for a second instance.
"""

from __future__ import annotations

import logging
import select
import signal
import time
from typing import Any

from django.conf import settings
from django.core.management.base import BaseCommand
from django.db import connection

from ...dispatcher import maintenance_tick, tick
from ...notifications import NOTIFICATION_CHANNEL

logger = logging.getLogger(__name__)


class EventListener:
    """`LISTEN kanban_events` on a dedicated autocommit connection.

    Django's ORM connection is unusable here: it lives inside whatever
    transaction the request cycle put it in, while a listener must stay in
    autocommit permanently to see notifications as they arrive. If the
    connection cannot be opened, or drops mid-wait, `wait()` swallows the
    failure and returns — the caller falls back to plain polling, which is
    the only requirement that matters: LISTEN is a speed-up, never a
    dependency.
    """

    def __init__(self) -> None:
        self._conn: Any = None

    def _connection(self) -> Any:
        if self._conn is not None:
            return self._conn
        import psycopg

        db = settings.DATABASES["default"]
        conn = psycopg.connect(
            dbname=db.get("NAME"),
            user=db.get("USER") or None,
            password=db.get("PASSWORD") or None,
            host=db.get("HOST") or None,
            port=db.get("PORT") or None,
            autocommit=True,
        )
        conn.execute(f"LISTEN {NOTIFICATION_CHANNEL}")
        self._conn = conn
        return conn

    def wait(self, timeout: float) -> bool:
        """Block up to `timeout` seconds. Returns True if a NOTIFY arrived."""

        try:
            conn = self._connection()
        except Exception:  # noqa: BLE001 - listener is optional, polling stays
            logger.warning("dispatcher_listener_connect_failed", exc_info=True)
            self._conn = None
            time.sleep(timeout)
            return False

        try:
            ready = select.select([conn.fileno()], [], [], timeout)[0]
            if not ready:
                return False
            # Drains everything queued so notifications never pile up in the
            # socket buffer between waits.
            return any(True for _ in conn.notifies(timeout=0))
        except Exception:  # noqa: BLE001
            logger.warning("dispatcher_listener_lost", exc_info=True)
            self.close()
            return False

    def close(self) -> None:
        if self._conn is not None:
            try:
                self._conn.close()
            except Exception:  # noqa: BLE001 - shutting down, nothing to do
                pass
            self._conn = None


class Command(BaseCommand):
    help = "Poll the database and deliver due notifications."

    def add_arguments(self, parser: Any) -> None:
        parser.add_argument(
            "--once",
            action="store_true",
            help="Run a single pass and exit.",
        )
        parser.add_argument(
            "--no-maintenance",
            action="store_true",
            help="Skip recurring cards and activity pruning.",
        )
        parser.add_argument(
            "--interval",
            type=int,
            default=None,
            help="Seconds between passes (default: DISPATCHER_POLL_SECONDS).",
        )

    def handle(self, *args: Any, **options: Any) -> None:
        interval = options["interval"] or settings.DISPATCHER_POLL_SECONDS
        maintenance_every = settings.DISPATCHER_MAINTENANCE_SECONDS
        run_maintenance = not options["no_maintenance"]

        if options["once"]:
            stats = tick()
            if run_maintenance:
                maintenance_tick()
            self.stdout.write(self.style.SUCCESS(f"dispatcher tick: {stats}"))
            return

        stopping = False

        def request_stop(signum: int, _frame: Any) -> None:
            # Finish the pass in flight rather than abandoning a send midway;
            # the loop checks this flag between passes.
            nonlocal stopping
            stopping = True
            self.stdout.write(f"dispatcher: получен сигнал {signum}, останавливаюсь")

        signal.signal(signal.SIGTERM, request_stop)
        signal.signal(signal.SIGINT, request_stop)

        # Postgres gets an early wakeup via LISTEN/NOTIFY; on any other
        # backend (SQLite in tests) the loop is plain polling, as before.
        listener = EventListener() if connection.vendor == "postgresql" else None

        self.stdout.write(
            self.style.SUCCESS(
                f"dispatcher: старт, интервал {interval}s, обслуживание каждые {maintenance_every}s"
            )
        )

        last_maintenance = 0.0

        try:
            while not stopping:
                started = time.monotonic()

                stats = tick()
                if any(stats.values()):
                    logger.info("dispatcher_tick %s", stats)

                if run_maintenance and started - last_maintenance >= maintenance_every:
                    maintenance_tick()
                    last_maintenance = started

                # A long-lived loop holds one connection open forever; if the
                # database drops it, every later pass fails on a dead socket.
                # Closing an unusable connection makes Django reconnect next pass.
                connection.close_if_unusable_or_obsolete()

                elapsed = time.monotonic() - started
                # Wait in slices no longer than a second so SIGTERM is honoured
                # promptly, waking early if `listener` sees a NOTIFY.
                remaining = max(0.0, interval - elapsed)
                while remaining > 0 and not stopping:
                    nap = min(1.0, remaining)
                    if listener is not None:
                        if listener.wait(nap):
                            break
                    else:
                        time.sleep(nap)
                    remaining -= nap
        finally:
            if listener is not None:
                listener.close()

        self.stdout.write(self.style.SUCCESS("dispatcher: остановлен"))
