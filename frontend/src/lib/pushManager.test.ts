import { afterEach, describe, expect, it, vi } from 'vitest'
import { registerServiceWorkerOnStartup } from './pushManager'

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
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
