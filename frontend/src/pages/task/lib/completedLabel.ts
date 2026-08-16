/**
 * Короткая дата для факта из прошлого («3 марта») — без слов «сегодня» /
 * «завтра», в отличие от `formatDeadlineShort`, которая обозначает срок
 * впереди.
 */
export function formatHistoryDate(iso: string, timeZone: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat('ru-RU', { timeZone, day: 'numeric', month: 'long' }).format(date)
}

/**
 * Строка вида «Лиза, 3 марта» для баннера завершённой задачи.
 */
export function formatCompletedBy(name: string, completedAtIso: string, timeZone: string): string {
  const date = formatHistoryDate(completedAtIso, timeZone)
  return date ? `${name}, ${date}` : name
}
