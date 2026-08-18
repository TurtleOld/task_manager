// A tiny IndexedDB store shared between the app and the service worker.
//
// The service worker needs the auth token to re-register a subscription when
// the browser renews it (`pushsubscriptionchange`) — at that moment no page may
// be open to supply the token, and localStorage is not reachable from the
// worker. IndexedDB is reachable from both.

const DB_NAME = 'task-manager-push'
const STORE = 'auth'
const KEY = 'auth'

export interface PushAuthRecord {
  token: string
  label?: string
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1)
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) {
        request.result.createObjectStore(STORE)
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

export function savePushAuth(record: PushAuthRecord): Promise<void> {
  return openDb().then(
    (db) =>
      new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE, 'readwrite')
        tx.objectStore(STORE).put(record, KEY)
        tx.oncomplete = () => {
          db.close()
          resolve()
        }
        tx.onerror = () => {
          db.close()
          reject(tx.error)
        }
      }),
  )
}

export function loadPushAuth(): Promise<PushAuthRecord | undefined> {
  return openDb().then(
    (db) =>
      new Promise<PushAuthRecord | undefined>((resolve, reject) => {
        const tx = db.transaction(STORE, 'readonly')
        const request = tx.objectStore(STORE).get(KEY)
        request.onsuccess = () => {
          db.close()
          resolve(request.result as PushAuthRecord | undefined)
        }
        request.onerror = () => {
          db.close()
          reject(request.error)
        }
      }),
  )
}

export function clearPushAuth(): Promise<void> {
  return openDb().then(
    (db) =>
      new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE, 'readwrite')
        tx.objectStore(STORE).delete(KEY)
        tx.oncomplete = () => {
          db.close()
          resolve()
        }
        tx.onerror = () => {
          db.close()
          reject(tx.error)
        }
      }),
  )
}
