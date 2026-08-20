import { describe, expect, it } from 'vitest'
import { matchBoardByTag, parseQuickAdd } from './quickAdd'

// Wednesday 2026-08-12, 12:00 UTC.
const NOW = new Date('2026-08-12T12:00:00Z')

const PEOPLE = [
  { id: 1, name: 'Лиза Иванова' },
  { id: 2, name: 'Максим' },
]

describe('parseQuickAdd', () => {
  it('распознаёт срок «сегодня»', () => {
    const result = parseQuickAdd('полить цветы сегодня', { now: NOW, timeZone: 'UTC', people: [] })
    expect(result.title).toBe('полить цветы')
    expect(result.deadline).toBe('2026-08-12T09:00:00.000Z')
  })

  it('распознаёт срок «в пятницу»', () => {
    const result = parseQuickAdd('позвонить в пятницу', { now: NOW, timeZone: 'UTC', people: [] })
    expect(result.title).toBe('позвонить')
    expect(result.deadline).toBe('2026-08-14T09:00:00.000Z')
  })

  it('распознаёт срок «через неделю»', () => {
    const result = parseQuickAdd('сдать отчёт через неделю', { now: NOW, timeZone: 'UTC', people: [] })
    expect(result.title).toBe('сдать отчёт')
    expect(result.deadline).toBe('2026-08-19T09:00:00.000Z')
  })

  it('распознаёт срок «15 марта»', () => {
    const result = parseQuickAdd('купить подарок 15 марта', { now: NOW, timeZone: 'UTC', people: [] })
    expect(result.title).toBe('купить подарок')
    expect(result.deadline).toBe('2027-03-15T09:00:00.000Z')
  })

  it('распознаёт исполнителя по префиксу имени без учёта регистра', () => {
    const result = parseQuickAdd('полить цветы @лиза', { now: NOW, timeZone: 'UTC', people: PEOPLE })
    expect(result.title).toBe('полить цветы')
    expect(result.assigneeId).toBe(1)
    expect(result.assigneeName).toBe('Лиза Иванова')
  })

  it('распознаёт тег', () => {
    const result = parseQuickAdd('полить цветы #дом', { now: NOW, timeZone: 'UTC', people: [] })
    expect(result.title).toBe('полить цветы')
    expect(result.tag).toBe('дом')
  })

  it('распознаёт срок, исполнителя и тег одновременно', () => {
    const result = parseQuickAdd('полить цветы завтра в 8 @лиза #дом', {
      now: NOW,
      timeZone: 'UTC',
      people: PEOPLE,
    })
    expect(result.title).toBe('полить цветы')
    expect(result.deadline).toBe('2026-08-13T08:00:00.000Z')
    expect(result.assigneeId).toBe(1)
    expect(result.tag).toBe('дом')
  })

  it('оставляет неопознанного @-исполнителя частью названия', () => {
    const result = parseQuickAdd('написать @незнакомец письмо', { now: NOW, timeZone: 'UTC', people: PEOPLE })
    expect(result.title).toBe('написать @незнакомец письмо')
    expect(result.assigneeId).toBeNull()
  })

  it('задача без распознанного срока не получает дедлайн', () => {
    const result = parseQuickAdd('разобрать шкаф', { now: NOW, timeZone: 'UTC', people: [] })
    expect(result.title).toBe('разобрать шкаф')
    expect(result.deadline).toBeNull()
  })
})

const BOARDS = [
  { id: 1, name: 'Мурчляндия' },
  { id: 2, name: 'Разработка' },
]

describe('matchBoardByTag', () => {
  it('находит список по префиксу имени без учёта регистра', () => {
    expect(matchBoardByTag('мурч', BOARDS)).toEqual({ id: 1, name: 'Мурчляндия' })
  })

  it('возвращает null, если тег не указан', () => {
    expect(matchBoardByTag(null, BOARDS)).toBeNull()
  })

  it('возвращает null для тега, не совпадающего ни с одним списком', () => {
    expect(matchBoardByTag('покупки', BOARDS)).toBeNull()
  })
})
