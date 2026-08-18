// Hand-written service worker for Web Push delivery.
//
// Built by vite-plugin-pwa in `injectManifest` mode: the plugin only injects
// the precache manifest (self.__WB_MANIFEST) and bundles this file. Everything
// else — receiving a push, opening the right task on click, and re-registering
// a renewed subscription — is here on purpose, because the generated mode has
// nowhere to put a custom delivery handler.
import { cleanupOutdatedCaches, precacheAndRoute } from 'workbox-precaching'

import { subscriptionToRegistrationBody } from './lib/push'
import { loadPushAuth } from './lib/pushIdb'

interface SwClient {
  focus(): Promise<unknown>
  navigate(url: string): Promise<unknown>
}

interface ExtendableEventLike {
  waitUntil(promise: Promise<unknown>): void
}

declare const self: {
  __WB_MANIFEST: Array<{ url: string; revision: string | null }>
  skipWaiting(): void
  clients: {
    claim(): Promise<void>
    matchAll(options?: { type?: string; includeUncontrolled?: boolean }): Promise<SwClient[]>
    openWindow(url: string): Promise<unknown>
  }
  registration: { showNotification(title: string, options?: NotificationOptions): Promise<void> }
  location: { origin: string }
  addEventListener(type: string, listener: (event: Event) => void): void
}

precacheAndRoute(self.__WB_MANIFEST)
cleanupOutdatedCaches()

// Automatic updates, no "update available" banner: a new worker takes over as
// soon as it is installed and activated.
self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  ;(event as unknown as ExtendableEventLike).waitUntil(self.clients.claim())
})

interface PushPayload {
  title?: string
  body?: string
  link?: string
  tag?: string
  data?: Record<string, string>
}

interface PushEventLike extends ExtendableEventLike {
  data: { json(): unknown } | null
}

self.addEventListener('push', (event) => {
  const pushEvent = event as unknown as PushEventLike
  let payload: PushPayload = {}
  if (pushEvent.data) {
    try {
      payload = pushEvent.data.json() as PushPayload
    } catch {
      payload = {}
    }
  }

  const title = payload.title ?? 'Уведомление'
  const options: NotificationOptions = {
    body: payload.body ?? '',
    icon: '/web-app-manifest-192x192.png',
    badge: '/web-app-manifest-192x192.png',
    // Re-notifying about the same task replaces the previous notification in
    // the shade instead of stacking duplicates.
    tag: payload.tag,
    data: { ...(payload.data ?? {}), link: payload.link ?? '' },
  }

  pushEvent.waitUntil(self.registration.showNotification(title, options))
})

interface NotificationClickEventLike extends ExtendableEventLike {
  notification: Notification & { data?: { link?: string } }
}

self.addEventListener('notificationclick', (event) => {
  const clickEvent = event as unknown as NotificationClickEventLike
  clickEvent.notification.close()

  const link = clickEvent.notification.data?.link ?? '/'
  const target = new URL(link, self.location.origin).href

  clickEvent.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        return client.navigate(target).then(() => client.focus())
      }
      return self.clients.openWindow(target)
    }),
  )
})

interface PushSubscriptionChangeEventLike extends ExtendableEventLike {
  newSubscription: PushSubscription | null
}

self.addEventListener('pushsubscriptionchange', (event) => {
  const changeEvent = event as unknown as PushSubscriptionChangeEventLike
  const newSubscription = changeEvent.newSubscription
  if (!newSubscription) return

  // The browser renewed the delivery parameters on its own (Chrome rotates
  // subscriptions). If we ignore this, notifications silently stop "after some
  // unknown time" — the original disease this whole feature fixes.
  changeEvent.waitUntil(
    loadPushAuth().then(async (auth) => {
      if (!auth?.token) return
      const body = subscriptionToRegistrationBody(newSubscription.toJSON())
      await fetch('/api/v1/push-devices/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Token ${auth.token}`,
        },
        body: JSON.stringify(body),
      })
    }),
  )
})
