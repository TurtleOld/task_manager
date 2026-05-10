import type { Card } from '../../api/types'

export type BoardAttachment = Card['attachments'][number]
export type BoardChecklistItem = Card['checklist'][number]
export type BoardLabel = Card['labels'][number]
export type BoardPriority = 0 | 1 | 2 | 3

export interface BoardCardDraft {
  title: string
  description: string
  assignee: number | null
  deadline: string
  priority: BoardPriority
  labels: BoardLabel[]
  checklist: BoardChecklistItem[]
  attachments: BoardAttachment[]
}

export interface AssigneeOption {
  id: number
  name: string
}
