"""Read-only diagnostic for the whole notification delivery chain.

Motivated by the incident where the dispatcher went silent for four days on a
`FOR UPDATE` + outer-join error while pytest was green, the healthcheck was
green, and the manual test-notification button worked (it bypasses the
dispatcher entirely). None of those signals answer "where exactly does the
chain break for a real event". This command reads every link — config,
dispatcher heartbeat, queue backlog, devices, preferences, recent deliveries —
and prints one report a person can act on. It sends nothing and changes
nothing.
"""

from __future__ import annotations

from typing import Any

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand
from django.db.models import Count
from django.utils import timezone

from ...models import (
    DispatcherHeartbeat,
    NotificationDelivery,
    NotificationEvent,
    NotificationPreference,
    PushDevice,
)
from ...webpush import webpush_configured


class Command(BaseCommand):
    help = "Print a human-readable report on the notification delivery chain."

    def add_arguments(self, parser: Any) -> None:
        parser.add_argument(
            "--limit",
            type=int,
            default=20,
            help="How many recent deliveries to list (default: 20).",
        )

    def handle(self, *args: Any, **options: Any) -> None:
        self._configuration()
        self._dispatcher()
        self._queue()
        self._devices()
        self._preferences()
        self._recent_deliveries(limit=options["limit"])

    def _section(self, title: str) -> None:
        self.stdout.write("")
        self.stdout.write(self.style.MIGRATE_HEADING(title))

    def _configuration(self) -> None:
        self._section("== Конфигурация ==")
        self.stdout.write(f"webpush_configured(): {webpush_configured()}")
        self.stdout.write(f"VAPID_PUBLIC_KEY задан: {bool(settings.VAPID_PUBLIC_KEY)}")
        self.stdout.write(f"VAPID_PRIVATE_KEY задан: {bool(settings.VAPID_PRIVATE_KEY)}")
        self.stdout.write(f"VAPID_CLAIM_EMAIL задан: {bool(settings.VAPID_CLAIM_EMAIL)}")
        self.stdout.write(f"WEBPUSH_TTL_SECONDS: {settings.WEBPUSH_TTL_SECONDS}")
        self.stdout.write(f"WEBPUSH_URGENCY: {settings.WEBPUSH_URGENCY}")
        self.stdout.write(f"FRONTEND_BASE_URL: {settings.FRONTEND_BASE_URL}")

    def _dispatcher(self) -> None:
        self._section("== Диспетчер ==")
        heartbeat = DispatcherHeartbeat.objects.filter(name="dispatcher").first()
        if not heartbeat or not heartbeat.last_tick_at:
            self.stdout.write(self.style.ERROR("Ни одного тика не зафиксировано."))
            return

        age_seconds = (timezone.now() - heartbeat.last_tick_at).total_seconds()
        tolerance = max(120, settings.DISPATCHER_POLL_SECONDS * 3)
        self.stdout.write(f"last_tick_at: {heartbeat.last_tick_at.isoformat()}")
        age_line = f"возраст последнего тика: {age_seconds:.0f}с (допуск {tolerance}с)"
        if age_seconds > tolerance:
            self.stdout.write(self.style.ERROR(age_line))
        else:
            self.stdout.write(age_line)
        self.stdout.write(f"ticks: {heartbeat.ticks}")
        if heartbeat.last_error:
            self.stdout.write(self.style.ERROR(f"last_error: {heartbeat.last_error}"))
        else:
            self.stdout.write("last_error: (пусто)")

    def _queue(self) -> None:
        self._section("== Очередь событий ==")
        by_status = (
            NotificationEvent.objects.values("dispatch_status")
            .annotate(count=Count("id"))
            .order_by("dispatch_status")
        )
        for row in by_status:
            self.stdout.write(f"{row['dispatch_status']}: {row['count']}")

        stuck_before = timezone.now() - timezone.timedelta(
            minutes=settings.DISPATCHER_STUCK_MINUTES
        )
        stuck = NotificationEvent.objects.filter(
            dispatch_status=NotificationEvent.Dispatch.PROCESSING,
            dispatch_started_at__lt=stuck_before,
        ).order_by("dispatch_started_at")
        if stuck.exists():
            self.stdout.write(self.style.WARNING(f"Застряло в PROCESSING: {stuck.count()}"))
            for event in stuck[:10]:
                self.stdout.write(
                    self.style.WARNING(
                        f"  event={event.id} type={event.event_type} "
                        f"started_at={event.dispatch_started_at}"
                    )
                )

        failed = NotificationEvent.objects.filter(
            dispatch_status=NotificationEvent.Dispatch.FAILED
        ).order_by("-id")
        if failed.exists():
            self.stdout.write(self.style.ERROR(f"FAILED: {failed.count()}"))
            for event in failed[:10]:
                self.stdout.write(
                    self.style.ERROR(
                        f"  event={event.id} type={event.event_type} "
                        f"error={event.dispatch_error}"
                    )
                )

    def _devices(self) -> None:
        self._section("== Устройства ==")
        users_without_devices = []
        for user in get_user_model().objects.all().order_by("id"):
            devices = list(PushDevice.objects.filter(user=user).order_by("-active", "-id"))
            active_count = sum(1 for d in devices if d.active)
            if active_count == 0:
                users_without_devices.append(user)
            if not devices:
                continue
            self.stdout.write(f"{user.username} (id={user.id}): активных устройств {active_count}")
            for device in devices:
                endpoint_hint = device.endpoint[:40]
                line = (
                    f"  label={device.label or '(без метки)'} active={device.active} "
                    f"failure_count={device.failure_count} "
                    f"last_success_at={device.last_success_at} "
                    f"last_failure_at={device.last_failure_at} "
                    f"endpoint={endpoint_hint}..."
                )
                if device.last_error:
                    line += f" last_error={device.last_error}"
                if device.active:
                    self.stdout.write(line)
                else:
                    self.stdout.write(self.style.WARNING(line))

        if users_without_devices:
            self.stdout.write("")
            self.stdout.write(
                self.style.WARNING("Пользователи без единого активного устройства (тишина штатна):")
            )
            for user in users_without_devices:
                self.stdout.write(self.style.WARNING(f"  {user.username} (id={user.id})"))

    def _preferences(self) -> None:
        self._section("== Отключённые настройками ==")
        disabled = NotificationPreference.objects.filter(enabled=False).select_related(
            "user", "board"
        )
        if not disabled.exists():
            self.stdout.write("Нет отключённых предпочтений.")
            return
        for pref in disabled:
            board_name = pref.board.name if pref.board else "(все доски)"
            self.stdout.write(
                f"user={pref.user.username} board={board_name} "
                f"event_type={pref.event_type} channel={pref.channel}"
            )

    def _recent_deliveries(self, *, limit: int) -> None:
        self._section(f"== Последние доставки (лимит {limit}) ==")
        deliveries = (
            NotificationDelivery.objects.select_related("user", "event")
            .order_by("-id")[:limit]
        )
        if not deliveries:
            self.stdout.write("Пусто.")
            return
        for delivery in deliveries:
            line = (
                f"id={delivery.id} sent_at={delivery.sent_at} "
                f"user={delivery.user.username} "
                f"event_type={delivery.event.event_type} status={delivery.status}"
            )
            if delivery.error:
                line += f" error={delivery.error}"
            if delivery.status == NotificationDelivery.Status.FAILED:
                self.stdout.write(self.style.ERROR(line))
            else:
                self.stdout.write(line)
