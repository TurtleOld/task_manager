"""Register (or remove) the Telegram bot webhook.

Runs as an explicit owner command, not from AppConfig.ready or a Gunicorn
worker, so the real `setWebhook` call happens exactly when the install owner
asks for it. The bot token travels in the request URL and the webhook secret in
the body — neither is logged (see `telegram._request`).

    python manage.py set_telegram_webhook          # register
    python manage.py set_telegram_webhook --delete # remove
"""

from __future__ import annotations

from typing import Any

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError

from ...telegram import (
    TelegramError,
    get_webhook_info,
    set_webhook,
    telegram_configured,
)


class Command(BaseCommand):
    help = "Register the Telegram webhook and verify it."

    def add_arguments(self, parser: Any) -> None:
        parser.add_argument(
            "--delete",
            action="store_true",
            help="Remove the webhook instead of registering it.",
        )

    def handle(self, *args: Any, **options: Any) -> None:
        if not telegram_configured():
            raise CommandError("TELEGRAM_BOT_TOKEN не задан.")

        try:
            if options["delete"]:
                set_webhook(url="", secret_token="")
                self.stdout.write(self.style.SUCCESS("Webhook удалён."))
                return

            url = settings.TELEGRAM_WEBHOOK_URL
            secret = settings.TELEGRAM_WEBHOOK_SECRET
            if not url or not secret:
                raise CommandError("Задайте TELEGRAM_WEBHOOK_URL и TELEGRAM_WEBHOOK_SECRET.")
            if not url.startswith("https://"):
                raise CommandError("TELEGRAM_WEBHOOK_URL должен начинаться с https://.")
            set_webhook(url=url, secret_token=secret)
            info = get_webhook_info()
        except TelegramError as exc:
            raise CommandError(f"Ошибка Telegram: {exc}") from exc

        self.stdout.write(
            self.style.SUCCESS(
                f"Webhook зарегистрирован: url={info.get('url')} "
                f"pending_update_count={info.get('pending_update_count')}"
            )
        )
