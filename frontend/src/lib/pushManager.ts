import { AUTH_TOKEN_KEY } from '../app/auth'
import { savePushAuth } from './pushIdb'
import {
  selectForeignRegistrations,
  subscriptionToRegistrationBody,
  urlBase64ToUint8Array,
} from './push'

const SW_URL = `${import.meta.env.BASE_URL}sw.js`
const API_V1 = `${import.meta.env.VITE_API_BASE_URL || '/api'}/v1`

export interface VapidKeyResponse {
  public_key: string
  configured: boolean
}

export interface PushDevice {
  id: number
  kind: string
  label: string
  active: boolean
  created_at: string
  last_success_at: string | null
  last_failure_at: string | null
  last_error: string
}

function authHeaders(extra: Record<string, string> = {}): Record<string, string> {
  const token = localStorage.getItem(AUTH_TOKEN_KEY)
  const headers: Record<string, string> = { 'Content-Type': 'application/json', ...extra }
  if (token) headers.Authorization = `Token ${token}`
  return headers
}

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const detail = await res.text()
    throw new Error(detail || `HTTP ${res.status}`)
  }
  return res.json() as Promise<T>
}

/** Register our service worker, then clean up any other provider's worker. */
export async function registerServiceWorker(): Promise<ServiceWorkerRegistration> {
  const registration = await navigator.serviceWorker.register(SW_URL)

  // One-time cleanup: the previous provider left its own registration on this
  // origin, and two handlers must not race for the same event.
  const registrations = await navigator.serviceWorker.getRegistrations()
  const own = registration.active?.scriptURL ?? registration.installing?.scriptURL ?? SW_URL
  const foreign = selectForeignRegistrations(registrations, own)
  await Promise.all(foreign.map((item) => item && item.unregister()))

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

export async function getVapidPublicKey(): Promise<VapidKeyResponse> {
  const res = await fetch(`${API_V1}/notifications/vapid-key/`, {
    headers: authHeaders(),
  })
  return json<VapidKeyResponse>(res)
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

  const key = await getVapidPublicKey()
  if (!key.configured || !key.public_key) {
    throw new Error('Web Push не настроен на сервере')
  }

  const applicationServerKey = urlBase64ToUint8Array(key.public_key)
  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: applicationServerKey as BufferSource,
  })

  const body = subscriptionToRegistrationBody(subscription.toJSON(), getDeviceLabel())
  const res = await fetch(`${API_V1}/push-devices/`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(body),
  })
  const device = await json<PushDevice>(res)

  const token = localStorage.getItem(AUTH_TOKEN_KEY)
  if (token) await savePushAuth({ token })

  return device
}

/** Turn notifications off on the current browser (unsubscribe + revoke). */
export async function disableCurrentDevice(): Promise<void> {
  const subscription = await getCurrentSubscription()
  if (subscription) {
    await subscription.unsubscribe()
  }
}
