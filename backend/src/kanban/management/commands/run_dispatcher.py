"""Run the notification dispatcher loop.

Replaces `celery worker` + `celery beat`. One process, one database, no broker
in the path a notification has to travel.

    python manage.py run_dispatcher

`--once` runs a single pass and exits, which is what tests and manual pokes
want. `--no-maintenance` skips recurring-card generation for a second instance.
"""

from __future__ import annotations

import logging
import signal
import time
from typing import Any

from django.conf import settings
from django.core.management.base import BaseCommand
from django.db import connection

from ...dispatcher import maintenance_tick, tick

logger = logging.getLogger(__name__)


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

        self.stdout.write(
            self.style.SUCCESS(
                f"dispatcher: старт, интервал {interval}s, обслуживание каждые {maintenance_every}s"
            )
        )

        last_maintenance = 0.0

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
            # Sleep in short slices so SIGTERM is honoured promptly instead of
            # after a full interval.
            remaining = max(0.0, interval - elapsed)
            while remaining > 0 and not stopping:
                nap = min(1.0, remaining)
                time.sleep(nap)
                remaining -= nap

        self.stdout.write(self.style.SUCCESS("dispatcher: остановлен"))
