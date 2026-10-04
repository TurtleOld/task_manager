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
  next_week_end: '2026-08-24T00:00:00+00:00',
  month_end: '2026-09-01T00:00:00+00:00',
  next_month_end: '2026-10-01T00:00:00+00:00',
}

// Saturday 2026-08-15: day_after_start coincides with week_end.
const SATURDAY: AgendaBoundaries = {
  timezone: 'UTC',
  today_start: '2026-08-15T00:00:00+00:00',
  tomorrow_start: '2026-08-16T00:00:00+00:00',
  day_after_start: '2026-08-17T00:00:00+00:00',
  week_end: '2026-08-17T00:00:00+00:00',
  next_week_end: '2026-08-24T00:00:00+00:00',
  month_end: '2026-09-01T00:00:00+00:00',
  next_month_end: '2026-10-01T00:00:00+00:00',
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
    version: 1,
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

  it('классифицирует срок со следующего понедельника по воскресенье как «На следующей неделе»', () => {
    expect(agendaGroupOf(makeCard({ deadline: '2026-08-17T10:00:00+00:00' }), WEDNESDAY)).toBe('next-week')
    expect(agendaGroupOf(makeCard({ deadline: '2026-08-23T10:00:00+00:00' }), WEDNESDAY)).toBe('next-week')
  })

  it('в субботу задача на следующий понедельник уходит в «На следующей неделе», а не в «На этой неделе»', () => {
    const card = makeCard({ deadline: '2026-08-17T10:00:00+00:00' })
    expect(agendaGroupOf(card, SATURDAY)).toBe('next-week')
  })

  it('после следующей недели и до конца месяца — «В этом месяце»', () => {
    expect(agendaGroupOf(makeCard({ deadline: '2026-08-24T10:00:00+00:00' }), WEDNESDAY)).toBe('this-month')
    expect(agendaGroupOf(makeCard({ deadline: '2026-08-31T22:00:00+00:00' }), WEDNESDAY)).toBe('this-month')
  })

  it('следующий календарный месяц — «В следующем месяце», дальше — «Позже»', () => {
    expect(agendaGroupOf(makeCard({ deadline: '2026-09-01T00:00:00+00:00' }), WEDNESDAY)).toBe('next-month')
    expect(agendaGroupOf(makeCard({ deadline: '2026-09-30T10:00:00+00:00' }), WEDNESDAY)).toBe('next-month')
    expect(agendaGroupOf(makeCard({ deadline: '2026-10-01T00:00:00+00:00' }), WEDNESDAY)).toBe('later')
  })

  it('следующая неделя, заходящая в новый месяц, остаётся «На следующей неделе»', () => {
    // Пятница 2026-08-28: следующая неделя — 31 августа … 6 сентября.
    const friday: AgendaBoundaries = {
      timezone: 'UTC',
      today_start: '2026-08-28T00:00:00+00:00',
      tomorrow_start: '2026-08-29T00:00:00+00:00',
      day_after_start: '2026-08-30T00:00:00+00:00',
      week_end: '2026-08-31T00:00:00+00:00',
      next_week_end: '2026-09-07T00:00:00+00:00',
      month_end: '2026-09-01T00:00:00+00:00',
      next_month_end: '2026-10-01T00:00:00+00:00',
    }
    expect(agendaGroupOf(makeCard({ deadline: '2026-09-03T10:00:00+00:00' }), friday)).toBe('next-week')
    expect(agendaGroupOf(makeCard({ deadline: '2026-09-10T10:00:00+00:00' }), friday)).toBe('next-month')
  })
})

describe('bucketAgendaCards', () => {
  it('раскладывает задачи по всем группам в порядке сервера', () => {
    const cards = [
      makeCard({ id: 1, title: 'Позже', deadline: '2026-10-20T10:00:00+00:00' }),
      makeCard({ id: 7, title: 'След. неделя', deadline: '2026-08-20T10:00:00+00:00' }),
      makeCard({ id: 8, title: 'Месяц', deadline: '2026-08-27T10:00:00+00:00' }),
      makeCard({ id: 9, title: 'След. месяц', deadline: '2026-09-12T10:00:00+00:00' }),
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
    expect(buckets['next-week'].map((card) => card.title)).toEqual(['След. неделя'])
    expect(buckets['this-month'].map((card) => card.title)).toEqual(['Месяц'])
    expect(buckets['next-month'].map((card) => card.title)).toEqual(['След. месяц'])
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
    expect(buckets['next-week'].map((card) => card.id)).toEqual([3, 4])
  })
})
