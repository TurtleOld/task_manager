"""Long-poll the Telegram Bot API and confirm personal-chat links.

Runs as its own long-lived process (a `telegram` service in docker-compose), so
the `getUpdates` long poll never stalls the notification dispatcher. When
TELEGRAM_BOT_TOKEN is empty the loop idles instead of exiting, so the container
stays up and starts working if the token is added.

    python manage.py run_telegram_poller
"""

from __future__ import annotations

import logging
import signal
import time
from typing import Any

from django.core.management.base import BaseCommand

from ...telegram import (
    TelegramError,
    TelegramLinkError,
    confirm_link,
    get_updates,
    parse_start_code,
    telegram_configured,
)

logger = logging.getLogger(__name__)


class Command(BaseCommand):
    help = "Long-poll Telegram updates and confirm personal-chat links."

    def handle(self, *args: Any, **options: Any) -> None:
        stopping = False

        def request_stop(signum: int, _frame: Any) -> None:
            nonlocal stopping
            stopping = True
            self.stdout.write(f"telegram poller: получен сигнал {signum}, останавливаюсь")

        signal.signal(signal.SIGTERM, request_stop)
        signal.signal(signal.SIGINT, request_stop)

        self.stdout.write(self.style.SUCCESS("telegram poller: старт"))

        # shortcut: the update offset lives only in this process. After a
        # restart Telegram re-delivers unconfirmed updates, and `confirm_link`
        # ignores already-used codes, so nothing is bound twice.
        offset: int | None = None

        def stop() -> bool:
            return stopping

        while not stopping:
            if not telegram_configured():
                logger.info("telegram_poller_not_configured idling")
                _interruptible_sleep(30, stop)
                continue

            try:
                updates = get_updates(offset=offset, timeout=50)
            except TelegramError as exc:
                logger.warning("telegram_poller_error %s", exc)
                _interruptible_sleep(5, stop)
                continue

            for update in updates:
                message = update.get("message") or {}
                code = parse_start_code(str(message.get("text") or ""))
                chat_id = (message.get("chat") or {}).get("id")
                if not code or chat_id is None:
                    # Not a link command: acknowledge it and move on.
                    offset = int(update["update_id"]) + 1
                    continue
                try:
                    confirm_link(code=code, chat_id=int(chat_id))
                except TelegramLinkError as exc:
                    # Permanent rejection — acknowledge so it is not re-delivered.
                    logger.info("telegram_link_ignored reason=%s", exc.reason)
                    offset = int(update["update_id"]) + 1
                except Exception as exc:  # noqa: BLE001 - one bad update must not kill the loop
                    # Transient failure: keep the offset so the update is retried.
                    logger.warning("telegram_link_failed error=%s", exc)
                    break
                else:
                    offset = int(update["update_id"]) + 1

        self.stdout.write(self.style.SUCCESS("telegram poller: остановлен"))


def _interruptible_sleep(seconds: int, stop: Any) -> None:
    # A plain sleep would delay SIGTERM by the full slice; 1s slices keep the
    # shutdown prompt without a busy loop.
    for _ in range(seconds):
        if stop():
            return
        time.sleep(1)
