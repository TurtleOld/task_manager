import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const clearQueries = vi.fn()

vi.mock('./queryClient', () => ({ queryClient: { clear: clearQueries } }))

const { clearLocalSession, isSignedIn, markSignedIn, onSessionCleared } = await import('./session')

const unsubscribe = vi.fn()
const clearStorage = vi.fn()
const deleteDatabase = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  unsubscribe.mockResolvedValue(true)
  deleteDatabase.mockImplementation(() => {
    const request: { onsuccess?: () => void } = {}
    queueMicrotask(() => request.onsuccess?.())
    return request
  })
  vi.stubGlobal('indexedDB', { deleteDatabase })
  vi.stubGlobal('localStorage', { clear: clearStorage })
  vi.stubGlobal('navigator', {
    serviceWorker: {
      getRegistration: async () => ({ pushManager: { getSubscription: async () => ({ unsubscribe }) } }),
    },
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('clearLocalSession', () => {
  it('unsubscribes push, drops IndexedDB, localStorage and the query cache', async () => {
    markSignedIn()

    await clearLocalSession()

    expect(unsubscribe).toHaveBeenCalledOnce()
    expect(deleteDatabase).toHaveBeenCalledExactlyOnceWith('task-manager-push')
    expect(clearStorage).toHaveBeenCalledOnce()
    expect(clearQueries).toHaveBeenCalledOnce()
    expect(isSignedIn()).toBe(false)
  })

  it('notifies listeners even when every step fails', async () => {
    clearStorage.mockImplementationOnce(() => {
      throw new Error('storage')
    })
    clearQueries.mockImplementationOnce(() => {
      throw new Error('cache')
    })
    deleteDatabase.mockImplementationOnce(() => {
      throw new Error('idb')
    })
    unsubscribe.mockRejectedValueOnce(new Error('offline'))
    const listener = vi.fn()
    const off = onSessionCleared(listener)

    await expect(clearLocalSession()).resolves.toBeUndefined()

    off()
    expect(listener).toHaveBeenCalledOnce()
    expect(unsubscribe).toHaveBeenCalledOnce()
  })

  it('runs once for concurrent triggers', async () => {
    await Promise.all([clearLocalSession(), clearLocalSession()])

    expect(clearStorage).toHaveBeenCalledOnce()
  })
})
