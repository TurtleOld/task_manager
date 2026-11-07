import { describe, expect, it } from 'vitest'
import type { Card } from '../types'
import { toAgendaCard, upsertAgendaCard } from './agenda'

const card: Card = {
  id: 1, board: 1, parent: null, title: 'Передать показания', description: '',
  assignee: 2, assignee_detail: { id: 2, username: 'maria', full_name: 'Мария' },
  created_by: 1, created_by_detail: { id: 1, username: 'alex', full_name: 'Александр' },
  deadline: null, priority: 0, labels: [], checklist: [], subtasks: [], attachments: [],
  position: '1', created_at: '2026-11-07T12:00:00Z', updated_at: '2026-11-07T12:00:00Z',
  version: 1, archived_at: null, parent_recurrence: null, recurrence: null,
}

describe('agenda people after task updates', () => {
  it('keeps creator and assignee names from mutation and realtime payloads', () => {
    const updated = toAgendaCard({ ...card, title: 'Новое название', version: 2 })
    const rows = upsertAgendaCard([toAgendaCard(card)], updated)
    expect(rows[0]?.created_by).toEqual(card.created_by_detail)
    expect(rows[0]?.assignee).toEqual(card.assignee_detail)
  })

  it('clears a removed assignee and does not restore a missing creator from the cache', () => {
    const updated = toAgendaCard({
      ...card, assignee: null, assignee_detail: null, created_by: null, created_by_detail: null,
    })
    const rows = upsertAgendaCard([toAgendaCard(card)], updated)
    expect(rows[0]?.assignee).toBeNull()
    expect(rows[0]?.created_by).toBeNull()
  })
})
