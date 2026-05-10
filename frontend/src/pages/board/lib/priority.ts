import type { BoardPriority } from '../types'

export const PRIORITY_NONE = 0 as const
export const PRIORITY_LOW = 1 as const
export const PRIORITY_NORMAL = 2 as const
export const PRIORITY_HIGH = 3 as const

export function priorityToMarker(priority: BoardPriority | number | null | undefined): string {
  switch (priority) {
    case PRIORITY_HIGH:
      return '🔥'
    case PRIORITY_LOW:
      return '🟢'
    case PRIORITY_NONE:
      return '⚪'
    case PRIORITY_NORMAL:
    default:
      return '🟡'
  }
}

export function priorityToLabel(priority: BoardPriority | number | null | undefined): string {
  switch (priority) {
    case PRIORITY_HIGH:
      return 'Срочно'
    case PRIORITY_LOW:
      return 'Можно когда будет время'
    case PRIORITY_NONE:
      return 'Без приоритета'
    case PRIORITY_NORMAL:
    default:
      return 'Важно (до конца недели)'
  }
}

export function priorityToTone(
  priority: BoardPriority | number | null | undefined,
): 'danger' | 'success' | 'warning' | 'neutral' {
  switch (priority) {
    case PRIORITY_HIGH:
      return 'danger'
    case PRIORITY_LOW:
      return 'success'
    case PRIORITY_NONE:
      return 'neutral'
    case PRIORITY_NORMAL:
    default:
      return 'warning'
  }
}
