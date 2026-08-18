import { AUTH_TOKEN_KEY } from '../app/auth'
import { api } from '../api/client'
import type { PushDevice } from '../api/types'
import { clearPushAuth, savePushAuth } from './pushIdb'
import { selectForeignRegistrations, subscriptionToRegistrationBody, urlBase64ToUint8Array } from './push'

const SW_URL = `${import.meta.env.BASE_URL || '/'}sw.js`
const DEVICE_ID_KEY = 'push_device_id'

/** Register our service worker, then clean up any other provider's worker. */
export async function registerServiceWorker(): Promise<ServiceWorkerRegistration> {
  const registration = await navigator.serviceWorker.register(SW_URL)

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
