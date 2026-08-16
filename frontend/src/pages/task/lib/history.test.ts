import { describe, expect, it } from 'vitest'
import type { CardActivity } from '../../../api/types'
import { buildHistoryEntries } from './history'

function makeActivity(overrides: Partial<CardActivity>): CardActivity {
  return {
    id: 1,
    card: 1,
    actor: 1,
    actor_name: 'Миша',
    actor_username: 'misha',
    action: 'card.updated',
    before: {},
    after: {},
    created_at: '2026-03-03T09:00:00+00:00',
    ...overrides,
  }
}

const resolveAssigneeName = (id: number) => (id === 7 ? 'Лиза' : `#${id}`)
const formatDeadline = (value: unknown) => (value == null ? 'без срока' : String(value))

describe('buildHistoryEntries', () => {
  it('drops entries where only the column changed', () => {
    const activities = [makeActivity({ before: { column: 1 }, after: { column: 2 } })]
    expect(buildHistoryEntries(activities, resolveAssigneeName, formatDeadline)).toEqual([])
  })

  it('never mentions the column even when it changes alongside a real field', () => {
    const activities = [
      makeActivity({ before: { column: 1, title: 'Купить хлеб' }, after: { column: 2, title: 'Купить молоко' } }),
    ]
    const entry = buildHistoryEntries(activities, resolveAssigneeName, formatDeadline)[0]!
    expect(entry.text).not.toMatch(/колонк/i)
    expect(entry.text).toContain('название: Купить хлеб → Купить молоко')
  })

  it('renders a dedicated sentence for completion, not a generic diff', () => {
    const activities = [makeActivity({ before: { completed_at: null }, after: { completed_at: '2026-03-03T09:00:00Z' } })]
    const entry = buildHistoryEntries(activities, resolveAssigneeName, formatDeadline)[0]!
    expect(entry.text).toBe('Миша отметил(а) задачу выполненной')
  })

  it('renders uncompletion distinctly from completion', () => {
    const activities = [makeActivity({ before: { completed_at: '2026-03-03T09:00:00Z' }, after: { completed_at: null } })]
    const entry = buildHistoryEntries(activities, resolveAssigneeName, formatDeadline)[0]!
    expect(entry.text).toBe('Миша снял(а) отметку с задачи')
  })

  it('resolves assignee ids to names', () => {
    const activities = [makeActivity({ before: { assignee: null }, after: { assignee: 7 } })]
    const entry = buildHistoryEntries(activities, resolveAssigneeName, formatDeadline)[0]!
    expect(entry.text).toContain('исполнитель: никто → Лиза')
  })

  it('labels priority changes with product-language names', () => {
    const activities = [makeActivity({ before: { priority: 0 }, after: { priority: 3 } })]
    const entry = buildHistoryEntries(activities, resolveAssigneeName, formatDeadline)[0]!
    expect(entry.text).toContain('приоритет: Без приоритета → Срочно')
  })
})
