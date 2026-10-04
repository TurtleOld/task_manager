import type { RecurrenceRule } from '../../../api/types'
import { russianPlural } from './taskFormat'

export type RecurrenceFreq = RecurrenceRule['freq']

export const WEEKDAY_LABELS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']

export const POSITION_OPTIONS: Array<{ value: number; label: string }> = [
  { value: 1, label: '1-й' },
  { value: 2, label: '2-й' },
  { value: 3, label: '3-й' },
  { value: 4, label: '4-й' },
  { value: -1, label: 'последний' },
]

export const UNIT_FORMS: Record<RecurrenceFreq, [string, string, string]> = {
  daily: ['день', 'дня', 'дней'],
  weekly: ['неделю', 'недели', 'недель'],
  monthly: ['месяц', 'месяца', 'месяцев'],
  yearly: ['год', 'года', 'лет'],
}

export const PRESETS: Array<{ label: string; freq: RecurrenceFreq }> = [
  { label: 'Каждый день', freq: 'daily' },
  { label: 'Каждую неделю', freq: 'weekly' },
  { label: 'Каждый месяц', freq: 'monthly' },
  { label: 'Каждый год', freq: 'yearly' },
]

export function summarizeRecurrence(rule: Pick<RecurrenceRule, 'freq' | 'interval' | 'byweekday' | 'bysetpos'>): string {
  const n = rule.interval
  const [one, few, many] = UNIT_FORMS[rule.freq]
  const every = rule.freq === 'weekly' ? 'Каждую' : 'Каждый'
  const base = n === 1 ? `${every} ${one}` : `Каждые ${n} ${russianPlural(n, one, few, many)}`

  if (rule.freq === 'weekly' && rule.byweekday.length > 0) {
    return `${base}: ${rule.byweekday.map((day) => WEEKDAY_LABELS[day]?.toLowerCase()).join(', ')}`
  }
  const weekday = rule.byweekday[0]
  if (rule.freq === 'monthly' && rule.bysetpos != null && weekday != null) {
    const position = POSITION_OPTIONS.find((option) => option.value === rule.bysetpos)?.label ?? rule.bysetpos
    return `${base}, ${position} ${WEEKDAY_LABELS[weekday]?.toLowerCase() ?? ''}`
  }
  return base
}
