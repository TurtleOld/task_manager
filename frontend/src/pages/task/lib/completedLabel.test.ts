import { describe, expect, it } from 'vitest'
import { formatCompletedBy, formatHistoryDate } from './completedLabel'

describe('formatHistoryDate', () => {
  it('formats a date without a "today"/"tomorrow" label', () => {
    expect(formatHistoryDate('2026-03-03T09:00:00+00:00', 'UTC')).toBe('3 марта')
  })

  it('returns an empty string for an invalid date', () => {
    expect(formatHistoryDate('not-a-date', 'UTC')).toBe('')
  })
})

describe('formatCompletedBy', () => {
  it('joins the name and the date', () => {
    expect(formatCompletedBy('Лиза', '2026-03-03T09:00:00+00:00', 'UTC')).toBe('Лиза, 3 марта')
  })

  it('falls back to just the name when the date cannot be parsed', () => {
    expect(formatCompletedBy('Лиза', 'not-a-date', 'UTC')).toBe('Лиза')
  })
})
