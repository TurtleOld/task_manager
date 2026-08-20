import { describe, expect, it } from 'vitest'
import type { AgendaBoundaries, AgendaCard } from '../../../api/types'
import { groupCompletedByDay } from './completedGrouping'

// Wednesday 2026-08-12, UTC.
const WEDNESDAY: AgendaBoundaries = {
  timezone: 'UTC',
  today_start: '2026-08-12T00:00:00+00:00',
  tomorrow_start: '2026-08-13T00:00:00+00:00',
  day_after_start: '2026-08-14T00:00:00+00:00',
  week_end: '2026-08-17T00:00:00+00:00',
}

const MOSCOW: AgendaBoundaries = {
  timezone: 'Europe/Moscow',
  today_start: '2026-08-12T00:00:00+03:00',
  tomorrow_start: '2026-08-13T00:00:00+03:00',
  day_after_start: '2026-08-14T00:00:00+03:00',
  week_end: '2026-08-17T00:00:00+03:00',
}

function makeCard(overrides: Partial<AgendaCard>): AgendaCard {
  return {
    id: 1,
    title: 'Задача',
    list: 1,
    deadline: null,
    priority: 0,
    assignee: null,
    completed_at: null,
    completed_by: null,
    has_subtasks: false,
    has_checklist: false,
    is_recurring: false,
    checklist_total: 0,
    checklist_completed: 0,
    created_at: '2026-08-12T10:00:00+00:00',
    ...overrides,
  }
}

describe('groupCompletedByDay', () => {
  it('группирует задачи, выполненные сегодня, под «Сегодня»', () => {
    const card = makeCard({ id: 1, completed_at: '2026-08-12T09:00:00+00:00' })
    const groups = groupCompletedByDay([card], WEDNESDAY)
    expect(groups).toHaveLength(1)
    expect(groups[0]!.label).toBe('Сегодня')
    expect(groups[0]!.cards).toEqual([card])
  })

  it('группирует задачи, выполненные вчера, под «Вчера»', () => {
    const card = makeCard({ id: 1, completed_at: '2026-08-11T09:00:00+00:00' })
    const groups = groupCompletedByDay([card], WEDNESDAY)
    expect(groups[0]!.label).toBe('Вчера')
  })

  it('форматирует более старые даты как «день месяц» без года в текущем году', () => {
    const card = makeCard({ id: 1, completed_at: '2026-08-01T09:00:00+00:00' })
    const groups = groupCompletedByDay([card], WEDNESDAY)
    expect(groups[0]!.label).toBe('1 августа')
  })

  it('добавляет год, если задача выполнена не в текущем году', () => {
    const card = makeCard({ id: 1, completed_at: '2025-12-31T09:00:00+00:00' })
    const groups = groupCompletedByDay([card], WEDNESDAY)
    expect(groups[0]!.label).toBe('31 декабря 2025 г.')
  })

  it('сортирует группы от новых к старым', () => {
    const older = makeCard({ id: 1, completed_at: '2026-08-10T09:00:00+00:00' })
    const newer = makeCard({ id: 2, completed_at: '2026-08-12T09:00:00+00:00' })
    const groups = groupCompletedByDay([older, newer], WEDNESDAY)
    expect(groups.map((g) => g.label)).toEqual(['Сегодня', '10 августа'])
  })

  it('группирует задачи по дню выполнения в часовом поясе пользователя', () => {
    // 23:30 UTC 11 августа — это уже 12 августа в Москве (UTC+3).
    const card = makeCard({ id: 1, completed_at: '2026-08-11T23:30:00+00:00' })
    const groups = groupCompletedByDay([card], MOSCOW)
    expect(groups[0]!.label).toBe('Сегодня')
  })

  it('игнорирует задачи без даты выполнения', () => {
    const card = makeCard({ id: 1, completed_at: null })
    expect(groupCompletedByDay([card], WEDNESDAY)).toEqual([])
  })
})
