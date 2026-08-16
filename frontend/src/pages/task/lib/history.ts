import type { CardActivity } from '../../../api/types'
import { priorityToLabel } from '../../board/lib/priority'

export interface HistoryEntry {
  id: number
  actorName: string
  createdAt: string
  text: string
}

const FIELD_LABELS: Record<string, string> = {
  title: 'название',
  description: 'описание',
  deadline: 'срок',
  priority: 'приоритет',
  assignee: 'исполнитель',
}

/**
 * Строит ленту истории задачи на языке продукта. Изменение поля «column»
 * (внутренний остаток модели доски) никогда не попадает в текст — история
 * не должна говорить о колонках (CONTEXT.md, §Организация). Если у записи
 * не осталось значимых полей после этого фильтра, запись целиком опускается.
 */
export function buildHistoryEntries(
  activities: CardActivity[],
  resolveAssigneeName: (id: number) => string,
  formatDeadline: (value: unknown) => string,
): HistoryEntry[] {
  const entries: HistoryEntry[] = []

  for (const activity of activities) {
    const actorName = activity.actor_name || 'Система'
    const fields = Object.keys(activity.after).filter((field) => field !== 'column')
    if (fields.length === 0) continue

    if (fields.length === 1 && fields[0] === 'completed_at') {
      const completed = activity.after.completed_at != null
      entries.push({
        id: activity.id,
        actorName,
        createdAt: activity.created_at,
        text: completed
          ? `${actorName} отметил(а) задачу выполненной`
          : `${actorName} снял(а) отметку с задачи`,
      })
      continue
    }

    const changeFields = fields.filter((field) => field !== 'completed_at')
    if (changeFields.length === 0) continue

    const changes = changeFields.map((field) =>
      formatFieldChange(field, activity.before[field], activity.after[field], resolveAssigneeName, formatDeadline),
    )
    entries.push({
      id: activity.id,
      actorName,
      createdAt: activity.created_at,
      text: `${actorName} изменил(а): ${changes.join('; ')}`,
    })
  }

  return entries
}

function formatFieldChange(
  field: string,
  before: unknown,
  after: unknown,
  resolveAssigneeName: (id: number) => string,
  formatDeadline: (value: unknown) => string,
): string {
  const label = FIELD_LABELS[field] ?? field
  const [beforeText, afterText] = formatValues(field, before, after, resolveAssigneeName, formatDeadline)
  return `${label}: ${beforeText} → ${afterText}`
}

function formatValues(
  field: string,
  before: unknown,
  after: unknown,
  resolveAssigneeName: (id: number) => string,
  formatDeadline: (value: unknown) => string,
): [string, string] {
  if (field === 'assignee') {
    return [formatAssignee(before, resolveAssigneeName), formatAssignee(after, resolveAssigneeName)]
  }
  if (field === 'priority') {
    return [formatPriority(before), formatPriority(after)]
  }
  if (field === 'deadline') {
    return [formatDeadline(before), formatDeadline(after)]
  }
  return [formatPlain(before), formatPlain(after)]
}

function formatAssignee(value: unknown, resolveAssigneeName: (id: number) => string): string {
  if (value == null) return 'никто'
  const id = Number(value)
  return Number.isFinite(id) ? resolveAssigneeName(id) : 'никто'
}

function formatPriority(value: unknown): string {
  const priority = Number(value)
  return Number.isFinite(priority) ? priorityToLabel(priority as 0 | 1 | 2 | 3) : 'без приоритета'
}

function formatPlain(value: unknown): string {
  if (value == null || value === '') return 'пусто'
  return String(value)
}
