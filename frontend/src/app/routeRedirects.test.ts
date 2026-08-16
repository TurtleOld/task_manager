import { describe, expect, it } from 'vitest'
import { resolveLegacyRedirect } from './routeRedirects'

describe('resolveLegacyRedirect', () => {
  it('maps a legacy board address to the list agenda', () => {
    expect(resolveLegacyRedirect('/boards/12')).toBe('/lists/12')
  })

  it('maps a legacy card address to the task inside the list', () => {
    expect(resolveLegacyRedirect('/boards/12/cards/345')).toBe('/lists/12/tasks/345')
  })

  it('preserves both identifiers in a card link from a notification email', () => {
    expect(resolveLegacyRedirect('/boards/12/cards/345')).toBe('/lists/12/tasks/345')
  })

  it('maps a legacy reminder link with a card fragment to the task', () => {
    expect(resolveLegacyRedirect('/boards/12', '#card-345')).toBe('/lists/12/tasks/345')
  })

  it('maps a board fragment without a card to the list agenda', () => {
    expect(resolveLegacyRedirect('/boards/12', '#other')).toBe('/lists/12')
  })

  it('maps the temporary all-lists agenda address to /today', () => {
    expect(resolveLegacyRedirect('/agenda')).toBe('/today')
  })

  it('maps the temporary single-list agenda address to the list agenda', () => {
    expect(resolveLegacyRedirect('/agenda/7')).toBe('/lists/7')
  })

  it('returns null for current addresses so they are left untouched', () => {
    expect(resolveLegacyRedirect('/')).toBeNull()
    expect(resolveLegacyRedirect('/today')).toBeNull()
    expect(resolveLegacyRedirect('/lists/12')).toBeNull()
    expect(resolveLegacyRedirect('/lists/12/tasks/345')).toBeNull()
    expect(resolveLegacyRedirect('/calendar')).toBeNull()
    expect(resolveLegacyRedirect('/archive')).toBeNull()
    expect(resolveLegacyRedirect('/settings')).toBeNull()
  })

  it('returns null for the removed inbox address', () => {
    expect(resolveLegacyRedirect('/inbox')).toBeNull()
  })

  it('returns null for malformed legacy addresses', () => {
    expect(resolveLegacyRedirect('/boards/not-a-number')).toBeNull()
    expect(resolveLegacyRedirect('/boards/12/cards/not-a-number')).toBeNull()
    expect(resolveLegacyRedirect('/boards/12/cards/345/extra')).toBeNull()
  })
})
