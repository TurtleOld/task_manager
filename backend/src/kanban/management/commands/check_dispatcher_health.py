from __future__ import annotations

from django.core.management.base import BaseCommand

from kanban.health import check_dispatcher


class Command(BaseCommand):
    help = "Exit non-zero when the notification dispatcher is stale or errored."

    def handle(self, *args, **options) -> None:
        result = check_dispatcher()
        if result.get("ok"):
            return
        self.stderr.write(f"dispatcher unhealthy: {result}")
        raise SystemExit(1)
