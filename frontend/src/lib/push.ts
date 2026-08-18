// Pure helpers for Web Push, kept free of DOM so they can be unit-tested
// without a browser. The service worker and the settings page both import from
// here, so a bug in one of these is a silent push failure — the exact problem
// the subscription flow exists to make visible.

/** VAPID public keys are base64url; the browser's `subscribe()` wants binary. */
export function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  const outputArray = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; i += 1) {
    outputArray[i] = rawData.charCodeAt(i)
  }
  return outputArray
}

/** The browser's `PushSubscription.toJSON()` shape (fields are optional there). */
export interface PushSubscriptionJson {
  endpoint?: string
  keys?: { p256dh?: string; auth?: string }
}

/** The body our registration endpoint accepts. */
export interface PushRegistrationBody {
  endpoint: string
  keys: { p256dh: string; auth: string }
  label?: string
}

/** Reshape what the browser produced into the registration body. */
export function subscriptionToRegistrationBody(
  subscription: PushSubscriptionJson,
  label?: string,
): PushRegistrationBody {
  return {
    endpoint: subscription.endpoint ?? '',
    keys: {
      p256dh: subscription.keys?.p256dh ?? '',
      auth: subscription.keys?.auth ?? '',
    },
    ...(label ? { label } : {}),
  }
}

/** Compare two service worker script URLs, ignoring query/hash differences. */
export function isSameScriptURL(a: string, b: string): boolean {
  try {
    const left = new URL(a, 'http://localhost')
    const right = new URL(b, 'http://localhost')
    return left.origin === right.origin && left.pathname === right.pathname
  } catch {
    return a === b
  }
}

export interface ServiceWorkerRegistrationLike {
  scope: string
  active: { scriptURL: string } | null
}

/**
 * Pick the service worker registrations that do NOT belong to us, so the
 * one-time cleanup can remove the previous provider's handler without touching
 * our own. The subtle part is the comparison: the same script can be reported
 * with a trailing slash or a query string, and removing our own handler because
 * of that difference is the classic self-inflicted bug.
 */
export function selectForeignRegistrations<T extends ServiceWorkerRegistrationLike>(
  registrations: readonly T[],
  ownScriptURL: string,
): T[] {
  return registrations.filter((registration) => {
    const scriptURL = registration.active?.scriptURL
    if (!scriptURL) return false
    return !isSameScriptURL(scriptURL, ownScriptURL)
  })
}
