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

from django.utils import timezone

from .models import PushDevice
from .webpush import (
    PushNotConfiguredError,
    PushSubscriptionGoneError,
    build_payload,
    webpush_configured,
)

logger = logging.getLogger(__name__)

# After this many consecutive failures a device is parked even without an
# explicit "gone" from the push service. Protects the dispatcher from spending
# every tick retrying an endpoint that is never coming back.
MAX_CONSECUTIVE_FAILURES = 10


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
    devices = list(PushDevice.objects.filter(user_id=user_id, active=True))
    if not devices:
        result.no_devices = True
        return result

    payload = build_payload(title=title, body=body, link=link, tag=tag, data=data)

    for device in devices:
        try:
            if not webpush_configured():
                raise PushNotConfiguredError("VAPID keys are not configured")
            from .webpush import send_webpush

            send_webpush(
                endpoint=device.endpoint,
                p256dh=device.p256dh,
                auth=device.auth,
                payload=payload,
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
