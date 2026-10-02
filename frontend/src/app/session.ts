import { queryClient } from './queryClient'
import { deletePushDb } from '../lib/pushIdb'

type Listener = () => void

const listeners = new Set<Listener>()
let pending: Promise<void> | null = null

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

async function clearSession(): Promise<void> {
  clearSync()
  listeners.forEach((listener) => listener())
  await Promise.allSettled([unsubscribeBrowser(), deletePushDb()])
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
