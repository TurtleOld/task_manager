import type { Card } from '../../api/types'

export type BoardAttachment = Card['attachments'][number]
export type BoardChecklistItem = Card['checklist'][number]
export type BoardPriority = '🔥' | '🟡' | '🟢'

export interface BoardCardDraft {
  title: string
  description: string
  assignee: number | null
  deadline: string
  priority: BoardPriority
  tags: string[]
  categories: string[]
  checklist: BoardChecklistItem[]
  attachments: BoardAttachment[]
}

export interface AssigneeOption {
  id: number
  name: string
}
