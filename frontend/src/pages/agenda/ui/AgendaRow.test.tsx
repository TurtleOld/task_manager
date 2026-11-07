// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { makeAgendaPlaceholderCard } from '../../../api/queries/agenda'
import type { AgendaBoundaries } from '../../../api/types'
import { AgendaRow } from './AgendaRow'

const boundaries: AgendaBoundaries = {
  timezone: 'UTC',
  today_start: '2026-11-07T00:00:00Z',
  tomorrow_start: '2026-11-08T00:00:00Z',
  day_after_start: '2026-11-09T00:00:00Z',
  week_end: '2026-11-09T00:00:00Z',
  next_week_end: '2026-11-16T00:00:00Z',
  month_end: '2026-12-01T00:00:00Z',
  next_month_end: '2027-01-01T00:00:00Z',
}

function showRow(assigned: boolean, creator: boolean) {
  const card = {
    ...makeAgendaPlaceholderCard({
      id: 1, title: 'Передать показания', list: 1,
      deadline: '2026-11-07T18:00:00Z',
      assignee: assigned ? { id: 2, name: 'Мария' } : null,
    }),
    created_by: creator ? { id: 1, username: 'alex', full_name: 'Александр' } : null,
    is_recurring: true,
  }
  return render(
    <MemoryRouter><ul><AgendaRow
      boundaries={boundaries} card={card} group="today" busy={false} deadlineBusy={false}
      onCompleteToggle={vi.fn()} onDeadlineCommit={vi.fn()}
      onSwipeComplete={vi.fn()} onSwipeTomorrow={vi.fn()}
    /></ul></MemoryRouter>,
  )
}

afterEach(cleanup)

describe('AgendaRow people', () => {
  it('shows the assignee after the deadline and the creator as the right avatar', () => {
    showRow(true, true)
    const assignee = screen.getByLabelText('Исполнитель: Мария')
    const author = screen.getByLabelText('Создатель: Александр')
    const deadline = screen.getByRole('button', { name: /срок/i })
    expect(assignee.textContent).toContain('Мария')
    expect(author.textContent).toBe('А')
    expect(deadline.compareDocumentPosition(assignee) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(assignee.compareDocumentPosition(screen.getByText('повторяется')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(assignee.compareDocumentPosition(author) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('does not substitute the assignee avatar for a missing creator', () => {
    showRow(true, false)
    expect(screen.getByLabelText('Исполнитель: Мария').textContent).toContain('Мария')
    expect(screen.queryByLabelText(/Создатель:/)).toBeNull()
  })

  it('shows a known creator even when nobody is assigned', () => {
    showRow(false, true)
    expect(screen.queryByLabelText(/Исполнитель:/)).toBeNull()
    expect(screen.getByLabelText('Создатель: Александр')).toBeTruthy()
  })
})
