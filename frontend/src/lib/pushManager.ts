import { AUTH_TOKEN_KEY } from '../app/auth'
import { api } from '../api/client'
import type { PushDevice } from '../api/types'
import { clearPushAuth, savePushAuth } from './pushIdb'
import { selectForeignRegistrations, subscriptionToRegistrationBody, urlBase64ToUint8Array } from './push'

const SW_URL = `${import.meta.env.BASE_URL || '/'}sw.js`
const DEVICE_ID_KEY = 'push_device_id'

/**
 * Wait until a registration has an active worker. `register()` resolves as
 * soon as the registration exists — on a first visit the worker is still
 * `installing`, and `pushManager.subscribe()` on that registration throws
 * "no active Service Worker" on Firefox (Chrome tends to tolerate it,
 * which is why this only shows up on mobile Firefox in practice).
 */
async function waitForActiveWorker(registration: ServiceWorkerRegistration): Promise<void> {
  if (registration.active) return
  const worker = registration.installing ?? registration.waiting
  if (!worker) return

  await new Promise<void>((resolve) => {
    worker.addEventListener('statechange', function onStateChange() {
      if (worker.state === 'activated') {
        worker.removeEventListener('statechange', onStateChange)
        resolve()
      }
    })
  })
}

/** Register our service worker, then clean up any other provider's worker. */
export async function registerServiceWorker(): Promise<ServiceWorkerRegistration> {
  const registration = await navigator.serviceWorker.register(SW_URL)
  await waitForActiveWorker(registration)

  // One-time cleanup: the previous provider left its own registration on this
  // origin, and two handlers must not race for the same event.
  const registrations = await navigator.serviceWorker.getRegistrations()
  const own = registration.active?.scriptURL ?? registration.installing?.scriptURL ?? SW_URL
  const foreign = selectForeignRegistrations(registrations, own)
  await Promise.all(foreign.map((item) => item.unregister()))

  return registration
}

export function getNotificationPermission(): NotificationPermission {
  if (!('Notification' in window)) return 'denied'
  return Notification.permission
}

export async function getCurrentSubscription(): Promise<PushSubscription | null> {
  const registration = await navigator.serviceWorker.ready
  return registration.pushManager.getSubscription()
}

export async function hasActiveSubscription(): Promise<boolean> {
  if (getNotificationPermission() !== 'granted') return false
  return (await getCurrentSubscription()) !== null
}

/** The id of the device this browser last registered (if any). */
export function getSavedDeviceId(): number | null {
  const raw = localStorage.getItem(DEVICE_ID_KEY)
  const parsed = raw ? Number(raw) : NaN
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

/** "Chrome на Android" style hint so a person can tell their devices apart. */
export function getDeviceLabel(): string {
  const ua = navigator.userAgent
  const isAndroid = /android/i.test(ua)
  const browser = /edg\//i.test(ua)
    ? 'Edge'
    : /firefox\//i.test(ua)
      ? 'Firefox'
      : /chrome\//i.test(ua)
        ? 'Chrome'
        : /safari\//i.test(ua)
          ? 'Safari'
          : 'Браузер'
  return isAndroid ? `${browser} на Android` : browser
}

/**
 * Enable notifications on the current browser: register the worker, ask for
 * permission (only here, on an explicit click), subscribe and hand the
 * subscription to the backend. Idempotent — re-running in the same browser
 * updates the existing device instead of duplicating it.
 */
export async function enableNotifications(): Promise<PushDevice> {
  const registration = await registerServiceWorker()

  const permission = await Notification.requestPermission()
  if (permission !== 'granted') {
    throw new Error('Разрешение на уведомления не получено')
  }

  const key = await api.getVapidKey()
  if (!key.configured || !key.public_key) {
    throw new Error('Web Push не настроен на сервере')
  }

  const applicationServerKey = urlBase64ToUint8Array(key.public_key)
  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: applicationServerKey as BufferSource,
  })

  const label = getDeviceLabel()
  const device = await api.registerPushDevice(subscriptionToRegistrationBody(subscription.toJSON(), label))

  const token = localStorage.getItem(AUTH_TOKEN_KEY)
  if (token) await savePushAuth({ token, label })
  localStorage.setItem(DEVICE_ID_KEY, String(device.id))

  return device
}

/** Turn notifications off on the current browser (unsubscribe + revoke). */
export async function disableCurrentDevice(): Promise<void> {
  const subscription = await getCurrentSubscription()
  if (subscription) {
    await subscription.unsubscribe()
  }
  localStorage.removeItem(DEVICE_ID_KEY)
  await clearPushAuth()
}

/**
 * Force a fresh subscription on this browser and replace the old device row.
 *
 * Android Chrome can let a subscription go stale on the FCM side without ever
 * telling either the browser or our server: `pushsubscriptionchange` does not
 * fire, and FCM keeps answering `webpush()` with success for a message that
 * never reaches the phone. The only known way out is to unsubscribe and
 * subscribe again, which forces Chrome to obtain a new FCM registration
 * token. This wraps that recovery in one call instead of requiring a person
 * to delete the device and re-enable notifications by hand.
 */
export async function resubscribe(): Promise<PushDevice> {
  const previousDeviceId = getSavedDeviceId()

  const existing = await getCurrentSubscription()
  if (existing) {
    await existing.unsubscribe()
  }

  const device = await enableNotifications()

  if (previousDeviceId !== null && previousDeviceId !== device.id) {
    try {
      await api.deletePushDevice(previousDeviceId)
    } catch {
      // The stale row is harmless if this fails — it will simply show up as
      // a second, inactive-looking device until someone removes it by hand.
    }
  }

  return device
}

const LAST_AUTO_RESUBSCRIBE_KEY = 'push_last_auto_resubscribe_at'

/**
 * Chrome ships `pushsubscriptionchange` only since version 137 (2025), and
 * even there its documented trigger is a revoked-then-regranted permission —
 * not the FCM-side token staleness this app hit in production, which fired
 * no event at all. Waiting for a reliable signal that may never come is not
 * an option, so instead this refreshes the subscription unconditionally on
 * a fixed cadence, the same mitigation push-notification providers document
 * for this exact gap. Fourteen days keeps the worst-case silent window
 * bounded without forcing every open tab to re-register on every load.
 */
const AUTO_RESUBSCRIBE_INTERVAL_DAYS = 14
const AUTO_RESUBSCRIBE_INTERVAL_MS = AUTO_RESUBSCRIBE_INTERVAL_DAYS * 24 * 60 * 60 * 1000

/**
 * Silently refresh this browser's push subscription if enough time has
 * passed since the last refresh. A no-op unless notifications are already
 * enabled on this browser — this never asks for permission or surfaces
 * anything to the user; `resubscribe()`'s own error handling already keeps
 * a failed attempt from raising past this call site.
 */
export async function maybeAutoResubscribe(): Promise<void> {
  if (getNotificationPermission() !== 'granted') return
  if (getSavedDeviceId() === null) return

  const storedAt = Number(localStorage.getItem(LAST_AUTO_RESUBSCRIBE_KEY) ?? 0)
  const dueAt = (Number.isFinite(storedAt) ? storedAt : 0) + AUTO_RESUBSCRIBE_INTERVAL_MS
  if (Date.now() < dueAt) return

  try {
    await resubscribe()
    localStorage.setItem(LAST_AUTO_RESUBSCRIBE_KEY, String(Date.now()))
  } catch {
    // Leave the stored timestamp untouched so the next app load tries again
    // instead of waiting out the full interval on a transient failure.
  }
}
