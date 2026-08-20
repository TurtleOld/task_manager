import type { AgendaBoundaries, AgendaCard } from '../../../api/types'

export type AgendaGroupId = 'overdue' | 'today' | 'tomorrow' | 'this-week' | 'later' | 'someday'

export const AGENDA_GROUP_ORDER: AgendaGroupId[] = ['overdue', 'today', 'tomorrow', 'this-week', 'later', 'someday']

export const AGENDA_GROUP_LABELS: Record<AgendaGroupId, string> = {
  overdue: 'Просрочено',
  today: 'Сегодня',
  tomorrow: 'Завтра',
  'this-week': 'На этой неделе',
  later: 'Позже',
  someday: 'Когда-нибудь',
}

export type AgendaViewMode = 'today' | 'week' | 'all' | 'completed'

/** Какие группы показывает каждая вкладка вида агенды («Сегодня / Неделя / Все дела»).
 * У вкладки «Выполнено» своя группировка по дате выполнения (см. `completedGrouping.ts`),
 * поэтому здесь для неё групп нет. */
export const AGENDA_VIEW_GROUPS: Record<AgendaViewMode, AgendaGroupId[]> = {
  today: ['overdue', 'today'],
  week: ['overdue', 'today', 'tomorrow', 'this-week'],
  all: AGENDA_GROUP_ORDER,
  completed: [],
}

function parseDate(value: string): number {
  return new Date(value).getTime()
}

/**
 * Группа, в которую попадает задача, по границам с сервера.
 *
 * Правило из спеки (§3.1): клиент не считает даты сам, а только применяет
 * границы `today_start` / `tomorrow_start` / `day_after_start` / `week_end`.
 * Выполненная задача не попадает в «Просрочено» независимо от срока (§3.1),
 * но остаётся видимой до конца дня (§3.2). Сервер возвращает задачи,
 * выполненные сегодня, включая те, чей срок в прошлом; единственная группа,
 * куда такая просроченная выполненная задача может попасть вне «Просрочено»
 * и где она видна до конца дня, — «Сегодня».
 */
export function agendaGroupOf(card: AgendaCard, boundaries: AgendaBoundaries): AgendaGroupId {
  if (card.deadline == null) return 'someday'

  const deadline = parseDate(card.deadline)
  const todayStart = parseDate(boundaries.today_start)
  const tomorrowStart = parseDate(boundaries.tomorrow_start)
  const dayAfterStart = parseDate(boundaries.day_after_start)
  const weekEnd = parseDate(boundaries.week_end)

  if (deadline < todayStart) {
    return card.completed_at ? 'today' : 'overdue'
  }
  if (deadline < tomorrowStart) return 'today'
  if (deadline < dayAfterStart) return 'tomorrow'
  if (deadline < weekEnd) return 'this-week'
  return 'later'
}

/**
 * Раскладывает плоский список задач по группам. Порядок внутри группы —
 * тот, что пришёл с сервера: он уже отсортирован по сроку, приоритету и
 * времени создания (см. issue 03).
 */
export function bucketAgendaCards(
  cards: AgendaCard[],
  boundaries: AgendaBoundaries,
): Record<AgendaGroupId, AgendaCard[]> {
  const buckets: Record<AgendaGroupId, AgendaCard[]> = {
    overdue: [],
    today: [],
    tomorrow: [],
    'this-week': [],
    later: [],
    someday: [],
  }

  for (const card of cards) {
    buckets[agendaGroupOf(card, boundaries)]?.push(card)
  }

  return buckets
}
