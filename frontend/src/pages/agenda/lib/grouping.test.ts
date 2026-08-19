import { describe, expect, it } from 'vitest'
import type { AgendaBoundaries, AgendaCard } from '../../../api/types'
import { agendaGroupOf, bucketAgendaCards } from './grouping'

// Wednesday 2026-08-12, week Monday..Sunday, week_end = next Monday.
const WEDNESDAY: AgendaBoundaries = {
  timezone: 'UTC',
  today_start: '2026-08-12T00:00:00+00:00',
  tomorrow_start: '2026-08-13T00:00:00+00:00',
  day_after_start: '2026-08-14T00:00:00+00:00',
  week_end: '2026-08-17T00:00:00+00:00',
}

// Saturday 2026-08-15: day_after_start coincides with week_end.
const SATURDAY: AgendaBoundaries = {
  timezone: 'UTC',
  today_start: '2026-08-15T00:00:00+00:00',
  tomorrow_start: '2026-08-16T00:00:00+00:00',
  day_after_start: '2026-08-17T00:00:00+00:00',
  week_end: '2026-08-17T00:00:00+00:00',
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
    created_at: '2026-08-12T10:00:00+00:00',
    ...overrides,
  }
}

describe('agendaGroupOf', () => {
  it('классифицирует задачу без срока как «Когда-нибудь»', () => {
    expect(agendaGroupOf(makeCard({ deadline: null }), WEDNESDAY)).toBe('someday')
  })

  it('классифицирует просроченную незавершённую задачу как «Просрочено»', () => {
    const card = makeCard({ deadline: '2026-08-11T10:00:00+00:00' })
    expect(agendaGroupOf(card, WEDNESDAY)).toBe('overdue')
  })

  it('не кладёт выполненную задачу в «Просрочено»: она остаётся видимой в «Сегодня»', () => {
    const card = makeCard({
      deadline: '2026-08-11T10:00:00+00:00',
      completed_at: '2026-08-12T09:00:00+00:00',
    })
    expect(agendaGroupOf(card, WEDNESDAY)).toBe('today')
  })

  it('классифицирует задачу с сегодняшним сроком как «Сегодня»', () => {
    const card = makeCard({ deadline: '2026-08-12T15:00:00+00:00' })
    expect(agendaGroupOf(card, WEDNESDAY)).toBe('today')
  })

  it('выполненная задача с сегодняшним сроком остаётся в «Сегодня»', () => {
    const card = makeCard({
      deadline: '2026-08-12T15:00:00+00:00',
      completed_at: '2026-08-12T09:00:00+00:00',
    })
    expect(agendaGroupOf(card, WEDNESDAY)).toBe('today')
  })

  it('классифицирует завтрашний срок как «Завтра»', () => {
    const card = makeCard({ deadline: '2026-08-13T10:00:00+00:00' })
    expect(agendaGroupOf(card, WEDNESDAY)).toBe('tomorrow')
  })

  it('классифицирует пятницу и воскресенье как «На этой неделе»', () => {
    expect(agendaGroupOf(makeCard({ deadline: '2026-08-14T10:00:00+00:00' }), WEDNESDAY)).toBe('this-week')
    expect(agendaGroupOf(makeCard({ deadline: '2026-08-16T10:00:00+00:00' }), WEDNESDAY)).toBe('this-week')
  })

  it('классифицирует срок со следующего понедельника как «Позже»', () => {
    const card = makeCard({ deadline: '2026-08-17T10:00:00+00:00' })
    expect(agendaGroupOf(card, WEDNESDAY)).toBe('later')
  })

  it('в субботу задача на следующий понедельник уходит в «Позже», а не в «На этой неделе»', () => {
    const card = makeCard({ deadline: '2026-08-17T10:00:00+00:00' })
    expect(agendaGroupOf(card, SATURDAY)).toBe('later')
  })
})

describe('bucketAgendaCards', () => {
  it('раскладывает задачи по шести группам в порядке сервера', () => {
    const cards = [
      makeCard({ id: 1, title: 'Позже', deadline: '2026-08-20T10:00:00+00:00' }),
      makeCard({ id: 2, title: 'Сегодня', deadline: '2026-08-12T15:00:00+00:00' }),
      makeCard({ id: 3, title: 'Когда-нибудь' }),
      makeCard({ id: 4, title: 'Просрочено', deadline: '2026-08-11T10:00:00+00:00' }),
      makeCard({ id: 5, title: 'Завтра', deadline: '2026-08-13T10:00:00+00:00' }),
      makeCard({ id: 6, title: 'Неделя', deadline: '2026-08-15T10:00:00+00:00' }),
    ]

    const buckets = bucketAgendaCards(cards, WEDNESDAY)

    expect(buckets.overdue.map((card) => card.title)).toEqual(['Просрочено'])
    expect(buckets.today.map((card) => card.title)).toEqual(['Сегодня'])
    expect(buckets.tomorrow.map((card) => card.title)).toEqual(['Завтра'])
    expect(buckets['this-week'].map((card) => card.title)).toEqual(['Неделя'])
    expect(buckets.later.map((card) => card.title)).toEqual(['Позже'])
    expect(buckets.someday.map((card) => card.title)).toEqual(['Когда-нибудь'])
  })

  it('сохраняет исходный порядок внутри группы (порядок задаёт сервер)', () => {
    const cards = [
      makeCard({ id: 1, deadline: '2026-08-12T10:00:00+00:00' }),
      makeCard({ id: 2, deadline: '2026-08-12T15:00:00+00:00' }),
      makeCard({ id: 3, deadline: '2026-08-12T20:00:00+00:00' }),
    ]

    const buckets = bucketAgendaCards(cards, WEDNESDAY)

    expect(buckets.today.map((card) => card.id)).toEqual([1, 2, 3])
  })

  it('в субботу группа «На этой неделе» пуста и не отрисовывается', () => {
    const cards = [
      makeCard({ id: 1, deadline: '2026-08-15T10:00:00+00:00' }),
      makeCard({ id: 2, deadline: '2026-08-16T10:00:00+00:00' }),
      makeCard({ id: 3, deadline: '2026-08-17T10:00:00+00:00' }),
      makeCard({ id: 4, deadline: '2026-08-20T10:00:00+00:00' }),
    ]

    const buckets = bucketAgendaCards(cards, SATURDAY)

    expect(buckets['this-week']).toHaveLength(0)
    expect(buckets.later.map((card) => card.id)).toEqual([3, 4])
  })
})
