import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  AUTH_FAILED_WS_CODE,
  isAuthFailureCloseCode,
  notifySessionExpired,
  setSessionExpiredHandler,
  shouldReconnectAfterClose,
} from './session'

afterEach(() => {
  setSessionExpiredHandler(null)
})

describe('session expiry notifications', () => {
  it('calls the registered handler', () => {
    const handler = vi.fn()
    setSessionExpiredHandler(handler)
    notifySessionExpired()
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('does nothing without a handler', () => {
    expect(() => notifySessionExpired()).not.toThrow()
  })

  it('stops calling a cleared handler', () => {
    const handler = vi.fn()
    setSessionExpiredHandler(handler)
    setSessionExpiredHandler(null)
    notifySessionExpired()
    expect(handler).not.toHaveBeenCalled()
  })

  it('treats the auth failure close code as a session expiry', () => {
    expect(isAuthFailureCloseCode(AUTH_FAILED_WS_CODE)).toBe(true)
    expect(isAuthFailureCloseCode(1000)).toBe(false)
  })

  it('stops reconnecting and notifies on the auth failure close code', () => {
    const handler = vi.fn()
    setSessionExpiredHandler(handler)
    expect(shouldReconnectAfterClose(AUTH_FAILED_WS_CODE)).toBe(false)
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('allows reconnecting after a normal close', () => {
    const handler = vi.fn()
    setSessionExpiredHandler(handler)
    expect(shouldReconnectAfterClose(1000)).toBe(true)
    expect(handler).not.toHaveBeenCalled()
  })
})
