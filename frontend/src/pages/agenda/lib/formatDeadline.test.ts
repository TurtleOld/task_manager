import { describe, expect, it } from 'vitest'
import type { AgendaBoundaries } from '../../../api/types'
import { formatDeadlineShort } from './formatDeadline'

const WEDNESDAY: AgendaBoundaries = {
  timezone: 'UTC',
  today_start: '2026-08-12T00:00:00+00:00',
  tomorrow_start: '2026-08-13T00:00:00+00:00',
  day_after_start: '2026-08-14T00:00:00+00:00',
  week_end: '2026-08-17T00:00:00+00:00',
}

describe('formatDeadlineShort', () => {
  it('добавляет время, если срок не ровно в полночь', () => {
    expect(formatDeadlineShort('2026-08-12T18:00:00+00:00', WEDNESDAY)).toBe('Сегодня, 12 авг., 18:00')
  })

  it('не показывает время для срока ровно в полночь', () => {
    expect(formatDeadlineShort('2026-08-12T00:00:00+00:00', WEDNESDAY)).toBe('Сегодня, 12 авг.')
  })

  it('показывает время для срока «завтра»', () => {
    expect(formatDeadlineShort('2026-08-13T09:30:00+00:00', WEDNESDAY)).toBe('Завтра, 13 авг., 09:30')
  })

  it('показывает время для срока в будущем без специальной метки дня', () => {
    expect(formatDeadlineShort('2026-08-20T14:15:00+00:00', WEDNESDAY)).toBe('20 авг., 14:15')
  })

  it('возвращает пустую строку без срока', () => {
    expect(formatDeadlineShort(null, WEDNESDAY)).toBe('')
  })
})
