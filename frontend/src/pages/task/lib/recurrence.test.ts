import { describe, expect, it } from 'vitest'
import { summarizeRecurrence } from './recurrence'

const rule = (overrides: Partial<Parameters<typeof summarizeRecurrence>[0]>) => ({
  freq: 'daily' as const,
  interval: 1,
  byweekday: [],
  bysetpos: null,
  ...overrides,
})

describe('summarizeRecurrence', () => {
  it('names a custom day interval in full words', () => {
    expect(summarizeRecurrence(rule({ interval: 28 }))).toBe('Каждые 28 дней')
    expect(summarizeRecurrence(rule({ interval: 2 }))).toBe('Каждые 2 дня')
    expect(summarizeRecurrence(rule({ interval: 21 }))).toBe('Каждые 21 день')
  })

  it('uses the singular form for an interval of one', () => {
    expect(summarizeRecurrence(rule({}))).toBe('Каждый день')
    expect(summarizeRecurrence(rule({ freq: 'weekly' }))).toBe('Каждую неделю')
    expect(summarizeRecurrence(rule({ freq: 'yearly' }))).toBe('Каждый год')
  })

  it('lists weekdays and the nth weekday of a month', () => {
    expect(summarizeRecurrence(rule({ freq: 'weekly', interval: 2, byweekday: [0, 3] }))).toBe('Каждые 2 недели: пн, чт')
    expect(summarizeRecurrence(rule({ freq: 'monthly', byweekday: [4], bysetpos: -1 }))).toBe('Каждый месяц, последний пт')
  })
})
