import type { AgendaBoundaries } from '../../../api/types'

/**
 * Короткое представление срока для строки агенды, в часовом поясе пользователя
 * (берётся из границ с сервера — своих расчётов дат клиент не ведёт).
 */
export function formatDeadlineShort(deadline: string | null, boundaries: AgendaBoundaries): string {
  if (!deadline) return ''

  const date = new Date(deadline)
  if (Number.isNaN(date.getTime())) return ''

  const tz = boundaries.timezone
  const todayStart = new Date(boundaries.today_start).getTime()
  const tomorrowStart = new Date(boundaries.tomorrow_start).getTime()
  const dayAfterStart = new Date(boundaries.day_after_start).getTime()
  const time = date.getTime()

  const dayLabel = new Intl.DateTimeFormat('ru-RU', {
    timeZone: tz,
    day: 'numeric',
    month: 'short',
  }).format(date)

  if (time >= todayStart && time < tomorrowStart) return `Сегодня, ${dayLabel}`
  if (time >= tomorrowStart && time < dayAfterStart) return `Завтра, ${dayLabel}`
  return dayLabel
}
