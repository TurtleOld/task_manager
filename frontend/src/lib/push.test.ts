import { describe, expect, it } from 'vitest'
import {
  isSameScriptURL,
  selectForeignRegistrations,
  subscriptionToRegistrationBody,
  urlBase64ToUint8Array,
} from './push'

describe('urlBase64ToUint8Array', () => {
  it('decodes a base64url string into the same bytes as a plain buffer', () => {
    // "hello" in base64url is "aGVsbG8", with no padding characters.
    const bytes = urlBase64ToUint8Array('aGVsbG8')
    expect(Array.from(bytes)).toEqual([104, 101, 108, 108, 111])
  })

  it('round-trips a VAPID-like key', () => {
    // btoa of the bytes 1..8, then made base64url-safe.
    const encoded = btoa(String.fromCharCode(1, 2, 3, 4, 5, 6, 7, 8))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '')
    expect(Array.from(urlBase64ToUint8Array(encoded))).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
  })

  it('handles strings that need padding restored', () => {
    // "ab" encodes to "YWI" (needs one padding char restored).
    expect(Array.from(urlBase64ToUint8Array('YWI'))).toEqual([97, 98])
  })
})

describe('subscriptionToRegistrationBody', () => {
  it('copies the endpoint and keys as the browser produced them', () => {
    const subscription = {
      endpoint: 'https://push.example.com/x',
      keys: { p256dh: 'p256dh-key', auth: 'auth-key' },
    }
    expect(subscriptionToRegistrationBody(subscription)).toEqual({
      endpoint: 'https://push.example.com/x',
      keys: { p256dh: 'p256dh-key', auth: 'auth-key' },
    })
  })

  it('adds a label only when provided', () => {
    const subscription = {
      endpoint: 'https://push.example.com/x',
      keys: { p256dh: 'p256dh-key', auth: 'auth-key' },
    }
    expect(subscriptionToRegistrationBody(subscription, 'Chrome на Android')).toEqual({
      endpoint: 'https://push.example.com/x',
      keys: { p256dh: 'p256dh-key', auth: 'auth-key' },
      label: 'Chrome на Android',
    })
    expect(subscriptionToRegistrationBody(subscription)).not.toHaveProperty('label')
  })
})

describe('selectForeignRegistrations', () => {
  const own = 'https://app.example.com/sw.js'

  it('returns nothing when the only registration is ours', () => {
    const registrations = [
      { scope: 'https://app.example.com/', active: { scriptURL: own } },
    ]
    expect(selectForeignRegistrations(registrations, own)).toEqual([])
  })

  it('does not remove our own handler despite an address difference', () => {
    // Same path, but reported with a query string the registration code added.
    const registrations = [
      { scope: 'https://app.example.com/', active: { scriptURL: `${own}?v=2` } },
    ]
    expect(selectForeignRegistrations(registrations, own)).toEqual([])
  })

  it('selects the previous provider registration for removal', () => {
    const foreign = 'https://app.example.com/OneSignalSDKWorker.js'
    const registrations = [
      { scope: 'https://app.example.com/', active: { scriptURL: own } },
      { scope: 'https://app.example.com/', active: { scriptURL: foreign } },
    ]
    const foreignOnly = selectForeignRegistrations(registrations, own)
    expect(foreignOnly).toHaveLength(1)
    expect(foreignOnly[0]?.active?.scriptURL).toBe(foreign)
  })

  it('ignores registrations without an active worker', () => {
    const registrations = [{ scope: 'https://app.example.com/', active: null }]
    expect(selectForeignRegistrations(registrations, own)).toEqual([])
  })
})

describe('isSameScriptURL', () => {
  it('treats a query string on the same path as equal', () => {
    expect(isSameScriptURL('https://app.example.com/sw.js', 'https://app.example.com/sw.js?v=1')).toBe(true)
  })

  it('treats a different path as different', () => {
    expect(isSameScriptURL('https://app.example.com/sw.js', 'https://app.example.com/other.js')).toBe(false)
  })
})
