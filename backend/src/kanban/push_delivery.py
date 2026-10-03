"""Fan a single push notification out to every device a user has registered.

A person is not a device. They carry a phone and leave a browser open on a
laptop, and every one of them needs its own subscription. Previously the
backend kept one `NotificationProfile.fcm_token`, so registering any of those
silently unregistered the others.

The rule here: a send succeeds if at least one device accepted it. Devices the
push service reports as gone are retired individually and never take the whole
delivery down with them.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import TYPE_CHECKING

from django.db import transaction
from django.utils import timezone

from .models import PushDevice
from .webpush import (
    PushNotConfiguredError,
    PushSubscriptionGoneError,
    build_payload,
    is_allowed_push_endpoint,
    webpush_configured,
)

if TYPE_CHECKING:
    from django.db.models import QuerySet

logger = logging.getLogger(__name__)

# After this many consecutive failures a device is parked even without an
# explicit "gone" from the push service. Protects the dispatcher from spending
# every tick retrying an endpoint that is never coming back.
MAX_CONSECUTIVE_FAILURES = 10


class PushEndpointNotAllowedError(RuntimeError):
    """The stored endpoint is not an allowlisted push service. Never contact it."""


@dataclass
class PushResult:
    """Outcome of one fan-out."""

    sent: int = 0
    retired: int = 0
    failed: int = 0
    no_devices: bool = False
    errors: list[str] = field(default_factory=list)

    @property
    def delivered(self) -> bool:
        return self.sent > 0

    def summary(self) -> str:
        if self.no_devices:
            return "Нет зарегистрированных устройств"
        parts = [f"доставлено: {self.sent}"]
        if self.retired:
            parts.append(f"отключено устройств: {self.retired}")
        if self.failed:
            parts.append(f"ошибок: {self.failed}")
        if self.errors:
            parts.append("; ".join(self.errors[:3]))
        return ", ".join(parts)


def _mark_success(device: PushDevice) -> None:
    device.last_success_at = timezone.now()
    device.failure_count = 0
    device.last_error = ""
    device.save(
        update_fields=[
            "last_success_at",
            "failure_count",
            "last_error",
            "updated_at",
            "version",
        ]
    )


def _mark_failure(device: PushDevice, error: str, *, retire: bool) -> None:
    device.last_failure_at = timezone.now()
    device.failure_count += 1
    device.last_error = error[:500]
    if retire or device.failure_count >= MAX_CONSECUTIVE_FAILURES:
        device.active = False
    device.save(
        update_fields=[
            "last_failure_at",
            "failure_count",
            "last_error",
            "active",
            "updated_at",
            "version",
        ]
    )


def deliverable_devices(*, user_id: int) -> QuerySet[PushDevice]:
    """Active devices of `user_id` whose session has not expired, locked for the send.

    `skip_locked` keeps a second dispatcher off a device already being sent to;
    the caller compares the result against the unlocked live count and retries
    the whole fan-out if any device was skipped. The lock is scoped to this
    table with `of=("self",)`: the filter joins `UserSession`, and a plain
    `FOR UPDATE` would also lock the session rows and block the daily cleanup.
    """

    return (
        PushDevice.objects.select_for_update(skip_locked=True, of=("self",))
        .live()
        .filter(user_id=user_id, active=True)
        .select_related("session")
    )


def send_push_to_user(
    *,
    user_id: int,
    title: str,
    body: str,
    link: str = "",
    tag: str = "",
    data: dict[str, str] | None = None,
) -> PushResult:
    """Deliver to every active device of `user_id`.

    Never raises for a per-device problem — inspect the returned `PushResult`.
    """

    result = PushResult()
    # The selection holds row locks, so it needs a transaction; the send itself
    # stays outside it, like every other network call in the dispatcher.
    with transaction.atomic():
        devices = list(deliverable_devices(user_id=user_id))
        live_count = PushDevice.objects.filter(user_id=user_id, active=True).live().count()
    if len(devices) < live_count:
        # `skip_locked` hides a device another dispatcher is sending to right
        # now. Retry the whole fan-out instead of dropping that device.
        result.failed = 1
        result.errors.append("Часть устройств занята другим процессом")
        return result
    if not devices:
        result.no_devices = True
        return result

    payload = build_payload(title=title, body=body, link=link, tag=tag, data=data)

    for device in devices:
        try:
            if not is_allowed_push_endpoint(device.endpoint):
                # Rows can predate the serializer allowlist. Retrying an
                # address we refuse to contact is pointless, so park the
                # device like a gone subscription.
                raise PushEndpointNotAllowedError
            if not webpush_configured():
                raise PushNotConfiguredError("VAPID keys are not configured")
            from .webpush import send_webpush

            send_webpush(
                endpoint=device.endpoint,
                p256dh=device.p256dh,
                auth=device.auth,
                payload=payload,
            )
        except PushEndpointNotAllowedError:
            _mark_failure(
                device,
                "Адрес push-сервиса не входит в список разрешённых",
                retire=True,
            )
            result.retired += 1
            logger.warning(
                "push_device_endpoint_not_allowed device=%s user=%s",
                device.pk,
                user_id,
            )
        except PushSubscriptionGoneError as exc:
            # The subscription is permanently gone: retire this device only.
            _mark_failure(device, str(exc), retire=True)
            result.retired += 1
            logger.info("push_device_retired device=%s user=%s", device.pk, user_id)
        except Exception as exc:  # noqa: BLE001 - transient; the device is kept
            _mark_failure(device, str(exc), retire=False)
            result.failed += 1
            result.errors.append(f"{device.kind}#{device.pk}: {exc}")
            logger.warning("push_device_failed device=%s user=%s error=%s", device.pk, user_id, exc)
        else:
            _mark_success(device)
            result.sent += 1

    return result
