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

  const timeLabel = new Intl.DateTimeFormat('ru-RU', {
    timeZone: tz,
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
  // Полночь по местному времени — это дата без явного времени (например, из
  // старых задач или быстрого добавления без времени): такие сроки не должны
  // выглядеть так, будто дедлайн ровно в 00:00.
  const withTime = (label: string) => (timeLabel === '00:00' ? label : `${label}, ${timeLabel}`)

  if (time >= todayStart && time < tomorrowStart) return withTime(`Сегодня, ${dayLabel}`)
  if (time >= tomorrowStart && time < dayAfterStart) return withTime(`Завтра, ${dayLabel}`)
  return withTime(dayLabel)
}
