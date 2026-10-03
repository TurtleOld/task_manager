import { afterEach, describe, expect, it, vi } from 'vitest'
import { readCsrfToken } from './csrf'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('readCsrfToken', () => {
  it('reads the csrftoken cookie among others', () => {
    vi.stubGlobal('document', { cookie: 'theme=dark; csrftoken=abc123; other=1' })
    expect(readCsrfToken()).toBe('abc123')
  })

  it('returns an empty string without the cookie', () => {
    vi.stubGlobal('document', { cookie: 'theme=dark' })
    expect(readCsrfToken()).toBe('')
  })
})
