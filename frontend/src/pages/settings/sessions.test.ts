import { describe, expect, it } from 'vitest'
import type { UserSessionInfo } from '../../api/types'
import { formatSessionDate, orderSessions } from './sessions'

function session(overrides: Partial<UserSessionInfo>): UserSessionInfo {
  return {
    id: 'id',
    label: 'Chrome на Android',
    login_at: '2026-10-01T10:00:00Z',
    last_activity: '2026-10-01T10:00:00Z',
    notifications_enabled: false,
    current: false,
    ...overrides,
  }
}

describe('orderSessions', () => {
  it('puts the current session first and the rest newest-first', () => {
    const older = session({ id: 'older', login_at: '2026-09-01T10:00:00Z' })
    const newer = session({ id: 'newer', login_at: '2026-10-02T10:00:00Z' })
    const current = session({ id: 'current', current: true, login_at: '2026-09-15T10:00:00Z' })

    expect(orderSessions([older, newer, current]).map((item) => item.id)).toEqual([
      'current',
      'newer',
      'older',
    ])
  })

  it('does not mutate the input', () => {
    const items = [session({ id: 'a' }), session({ id: 'b' })]
    orderSessions(items)
    expect(items.map((item) => item.id)).toEqual(['a', 'b'])
  })
})

describe('formatSessionDate', () => {
  it('renders a moment with day precision only', () => {
    const noon = new Date(2026, 9, 3, 12, 0, 0)
    expect(formatSessionDate(noon.toISOString())).toBe('03.10.2026')
  })

  it('falls back for an unparsable value', () => {
    expect(formatSessionDate('not-a-date')).toBe('—')
  })
})
