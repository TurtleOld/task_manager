"""Web Push (RFC 8030 / VAPID) delivery.

The browser hands us a subscription — an endpoint URL plus two encryption
keys — and we hand the push service an encrypted payload addressed to it. The
push service holds the message until the device comes online, which is why a
notification arrives even when the tab is closed and the phone is asleep.

Delivery failures split into two kinds, and conflating them is what silently
unsubscribes people:

  * `PushSubscriptionGoneError` — the subscription no longer exists (404/410).
    The device is retired; the user must re-subscribe from the browser.
  * `PushDeliveryError` — anything else (network, 5xx, rate limit). Transient.
    The subscription stays and the send is retried later.
"""

from __future__ import annotations

import json
import logging
from typing import Any

from django.conf import settings

logger = logging.getLogger(__name__)


class PushDeliveryError(RuntimeError):
    """Transient failure: worth retrying, subscription stays."""


class PushSubscriptionGoneError(PushDeliveryError):
    """Permanent failure: the push service says this subscription is gone."""


class PushNotConfiguredError(RuntimeError):
    """VAPID keys are missing, so no Web Push can be sent at all."""


def webpush_configured() -> bool:
    return bool(
        settings.VAPID_PRIVATE_KEY and settings.VAPID_PUBLIC_KEY and settings.VAPID_CLAIM_EMAIL
    )


def _vapid_claims() -> dict[str, str]:
    # pywebpush mutates the claims dict it is given (it inserts `exp`), so a
    # fresh copy per call is required. Reusing one dict leaks an expired `exp`
    # into every subsequent send, and the push service starts answering 401.
    return {"sub": settings.VAPID_CLAIM_EMAIL}


def build_payload(
    *,
    title: str,
    body: str,
    link: str = "",
    tag: str = "",
    data: dict[str, Any] | None = None,
) -> str:
    """Serialize what the service worker's `push` handler will receive."""

    payload: dict[str, Any] = {"title": title, "body": body}
    if link:
        payload["link"] = link
    if tag:
        # Lets a repeated notification about the same task replace the
        # previous one instead of stacking up in the shade.
        payload["tag"] = tag
    if data:
        payload["data"] = data
    return json.dumps(payload, ensure_ascii=False)


def send_webpush(*, endpoint: str, p256dh: str, auth: str, payload: str) -> None:
    """Send one encrypted push message. Raises on failure, returns None on success."""

    if not webpush_configured():
        raise PushNotConfiguredError(
            "VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY / VAPID_CLAIM_EMAIL are not configured"
        )

    try:
        from pywebpush import WebPushException, webpush
    except ImportError as exc:  # pragma: no cover - deployment dependency guard
        raise PushNotConfiguredError("pywebpush is required for Web Push delivery") from exc

    subscription = {
        "endpoint": endpoint,
        "keys": {"p256dh": p256dh, "auth": auth},
    }

    try:
        webpush(
            subscription_info=subscription,
            data=payload,
            vapid_private_key=settings.VAPID_PRIVATE_KEY,
            vapid_claims=_vapid_claims(),
            timeout=10,
        )
    except WebPushException as exc:
        status = getattr(getattr(exc, "response", None), "status_code", None)
        body = ""
        try:
            body = exc.response.text if exc.response is not None else ""
        except Exception:  # noqa: BLE001 - diagnostics must never mask the real error
            body = "<failed to read response body>"

        # 404: the endpoint never existed. 410 Gone: the browser dropped the
        # subscription (permissions revoked, profile cleared, app uninstalled).
        # Both are permanent; everything else deserves another attempt.
        if status in {404, 410}:
            logger.info(
                "webpush_subscription_gone status=%s endpoint=%s",
                status,
                endpoint[:80],
            )
            raise PushSubscriptionGoneError(f"Subscription gone: HTTP {status}") from exc

        logger.warning(
            "webpush_delivery_failed status=%s endpoint=%s body=%s",
            status,
            endpoint[:80],
            body[:300],
        )
        raise PushDeliveryError(f"Web Push error: HTTP {status}; body={body[:300]}") from exc
    except Exception as exc:  # noqa: BLE001 - network stack raises many types
        logger.warning("webpush_delivery_failed endpoint=%s error=%s", endpoint[:80], exc)
        raise PushDeliveryError(f"Web Push connection error: {exc}") from exc
