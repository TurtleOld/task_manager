import type { AgendaBoundaries, AgendaCard } from '../../../api/types'

export interface CompletedDayGroup {
  key: string
  label: string
  cards: AgendaCard[]
}

function dayKey(value: string, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(
    new Date(value),
  )
}

function parseDayKey(key: string): { year: number; month: number; day: number } {
  const parts = key.split('-').map(Number)
  return { year: parts[0] ?? 1970, month: parts[1] ?? 1, day: parts[2] ?? 1 }
}

function dayLabel(key: string, todayKey: string, yesterdayKey: string): string {
  if (key === todayKey) return 'Сегодня'
  if (key === yesterdayKey) return 'Вчера'
  const { year, month, day } = parseDayKey(key)
  const date = new Date(Date.UTC(year, month - 1, day))
  const sameYear = year === parseDayKey(todayKey).year
  return new Intl.DateTimeFormat('ru-RU', {
    timeZone: 'UTC',
    day: 'numeric',
    month: 'long',
    year: sameYear ? undefined : 'numeric',
  }).format(date)
}

/**
 * Группирует выполненные задачи по дню выполнения (в часовом поясе
 * пользователя), от новых к старым. Сервер уже отдаёт список отсортированным
 * по `completed_at` по убыванию (см. `completed_queryset`), так что порядок
 * внутри групп сохраняется как есть.
 */
export function groupCompletedByDay(cards: AgendaCard[], boundaries: AgendaBoundaries): CompletedDayGroup[] {
  const timeZone = boundaries.timezone
  const todayKey = dayKey(boundaries.today_start, timeZone)
  const today = parseDayKey(todayKey)
  const yesterdayKey = dayKey(new Date(Date.UTC(today.year, today.month - 1, today.day - 1)).toISOString(), 'UTC')

  const groups = new Map<string, AgendaCard[]>()
  for (const card of cards) {
    if (!card.completed_at) continue
    const key = dayKey(card.completed_at, timeZone)
    const bucket = groups.get(key)
    if (bucket) bucket.push(card)
    else groups.set(key, [card])
  }

  return Array.from(groups.entries())
    .sort(([a], [b]) => (a < b ? 1 : -1))
    .map(([key, dayCards]) => ({
      key,
      label: dayLabel(key, todayKey, yesterdayKey),
      cards: dayCards,
    }))
}
