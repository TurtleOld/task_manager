import { describe, expect, it } from 'vitest'
import { shouldApplyCardVersion } from './cardVersion'

describe('shouldApplyCardVersion', () => {
  it('applies an event when nothing is cached yet', () => {
    expect(shouldApplyCardVersion(3, undefined)).toBe(true)
  })

  it('applies an event with the same version', () => {
    expect(shouldApplyCardVersion(3, 3)).toBe(true)
  })

  it('applies a newer event', () => {
    expect(shouldApplyCardVersion(4, 3)).toBe(true)
  })

  it('ignores an event older than the cached card', () => {
    expect(shouldApplyCardVersion(2, 3)).toBe(false)
  })
})
