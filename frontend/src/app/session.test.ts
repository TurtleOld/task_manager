import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const clearQueries = vi.fn()
const deletePushDb = vi.fn()

vi.mock('./queryClient', () => ({ queryClient: { clear: clearQueries } }))
vi.mock('../lib/pushIdb', () => ({ deletePushDb }))

const { clearLocalSession, onSessionCleared } = await import('./session')

const unsubscribe = vi.fn()
const clearStorage = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  deletePushDb.mockResolvedValue(undefined)
  unsubscribe.mockResolvedValue(true)
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
    await clearLocalSession()

    expect(unsubscribe).toHaveBeenCalledOnce()
    expect(deletePushDb).toHaveBeenCalledOnce()
    expect(clearStorage).toHaveBeenCalledOnce()
    expect(clearQueries).toHaveBeenCalledOnce()
  })

  it('notifies listeners even when every step fails', async () => {
    clearStorage.mockImplementationOnce(() => {
      throw new Error('storage')
    })
    clearQueries.mockImplementationOnce(() => {
      throw new Error('cache')
    })
    deletePushDb.mockRejectedValueOnce(new Error('idb'))
    unsubscribe.mockRejectedValueOnce(new Error('offline'))
    const listener = vi.fn()
    const off = onSessionCleared(listener)

    await expect(clearLocalSession()).resolves.toBeUndefined()

    off()
    expect(listener).toHaveBeenCalledOnce()
    expect(deletePushDb).toHaveBeenCalledOnce()
  })

  it('runs once for concurrent triggers', async () => {
    await Promise.all([clearLocalSession(), clearLocalSession()])

    expect(clearStorage).toHaveBeenCalledOnce()
  })
})
