import { afterEach, describe, expect, it, vi } from 'vitest'

const registerPushDevice = vi.fn()
vi.mock('../api/client', () => ({ api: { registerPushDevice } }))

const { registerExistingSubscription, registerServiceWorkerOnStartup } = await import('./pushManager')

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

describe('registerServiceWorkerOnStartup', () => {
  it('is a no-op outside the production build', () => {
    const register = vi.fn()
    vi.stubGlobal('navigator', { serviceWorker: { register } })
    registerServiceWorkerOnStartup()
    expect(register).not.toHaveBeenCalled()
  })

  it('does nothing where service workers are unsupported', () => {
    vi.stubEnv('PROD', true)
    vi.stubGlobal('navigator', {})
    expect(() => registerServiceWorkerOnStartup()).not.toThrow()
  })
})

describe('registerExistingSubscription', () => {
  const subscription = {
    toJSON: () => ({ endpoint: 'https://fcm.googleapis.com/x', keys: { p256dh: 'p', auth: 'a' } }),
  }
  const setItem = vi.fn()

  function stubBrowser(permission: NotificationPermission) {
    vi.stubGlobal('Notification', { permission })
    vi.stubGlobal('window', { Notification: {} })
    vi.stubGlobal('localStorage', { setItem })
    vi.stubGlobal('navigator', {
      userAgent: 'Firefox/131.0',
      serviceWorker: {
        getRegistration: async () => ({ pushManager: { getSubscription: async () => subscription } }),
      },
    })
  }

  it('registers the live subscription on the new session without asking', async () => {
    stubBrowser('granted')
    registerPushDevice.mockResolvedValue({ id: 42 })

    await registerExistingSubscription()

    expect(registerPushDevice).toHaveBeenCalledExactlyOnceWith({
      endpoint: 'https://fcm.googleapis.com/x',
      keys: { p256dh: 'p', auth: 'a' },
      label: 'Firefox',
    })
    expect(setItem).toHaveBeenCalledWith('push_device_id', '42')
  })

  it('leaves a browser without granted permission alone', async () => {
    stubBrowser('default')

    await registerExistingSubscription()

    expect(registerPushDevice).not.toHaveBeenCalled()
  })
})
