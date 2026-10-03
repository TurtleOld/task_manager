import { queryClient } from './queryClient'

type Listener = () => void

// Where the token-based app kept the token for its service worker.
const LEGACY_PUSH_DB = 'task-manager-push'

const listeners = new Set<Listener>()
let pending: Promise<void> | null = null
let signedIn = false

export function markSignedIn() {
  signedIn = true
}

export function isSignedIn(): boolean {
  return signedIn
}

export function onSessionCleared(listener: Listener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

async function unsubscribeBrowser(): Promise<void> {
  const registration = await navigator.serviceWorker.getRegistration()
  const subscription = await registration?.pushManager.getSubscription()
  await subscription?.unsubscribe()
}

function clearSync() {
  for (const step of [() => localStorage.clear(), () => queryClient.clear()]) {
    try {
      step()
    } catch {
      // A failed step must not stop the rest of the cleanup.
    }
  }
}

export function deleteLegacyPushDb(): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(LEGACY_PUSH_DB)
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
    request.onblocked = () => resolve()
  })
}

async function clearSession(): Promise<void> {
  signedIn = false
  clearSync()
  listeners.forEach((listener) => listener())
  await Promise.allSettled([unsubscribeBrowser(), deleteLegacyPushDb()])
}

/**
 * Full local cleanup shared by logout, a 401 from the API and a 4001 socket
 * close. Works offline: nothing here talks to the server, and a failing step
 * never blocks the others.
 */
export function clearLocalSession(): Promise<void> {
  pending ??= clearSession().finally(() => {
    pending = null
  })
  return pending
}
