// Generated via openapi-typescript normally; minimal hand-written fallback
export interface Board {
  id: number
  name: string
  created_at: string
  updated_at: string
  version: number
}

export interface Column {
  id: number
  board: number
  name: string
  icon: string
  position: string
  created_at: string
  updated_at: string
  version: number
}

export interface Card {
  id: number
  board: number
  column: number
  assignee: number | null
  title: string
  description: string
  deadline: string | null
  estimate: string
  priority: string
  tags: string[]
  categories: string[]
  checklist: { id: string; text: string; done: boolean }[]
  attachments: { id: string; name: string; type: 'file' | 'link' | 'photo'; url?: string }[]
  position: string
  created_at: string
  updated_at: string
  version: number
}

export interface AuthUser {
  id: number
  username: string
  full_name: string
  is_admin: boolean
  role?: 'admin' | 'manager' | 'editor' | 'viewer'
  token: string
}

export type UserRole = 'admin' | 'manager' | 'editor' | 'viewer'

export type PermissionKey =
  | 'boards:view'
  | 'boards:add'
  | 'boards:edit'
  | 'boards:delete'
  | 'columns:view'
  | 'columns:add'
  | 'columns:edit'
  | 'columns:delete'
  | 'cards:view'
  | 'cards:add'
  | 'cards:edit'
  | 'cards:delete'

export interface AdminUser {
  id: number
  username: string
  full_name: string
  is_admin: boolean
  role: UserRole
  permissions: PermissionKey[]
}

export interface RegistrationStatus {
  user_count: number
  allow_first: boolean
  allow_admin: boolean
}

export type NotificationChannel = 'email' | 'telegram'

export type NotificationEventType =
  | 'board.created'
  | 'board.updated'
  | 'board.deleted'
  | 'column.created'
  | 'column.updated'
  | 'column.deleted'
  | 'card.created'
  | 'card.updated'
  | 'card.deleted'
  | 'card.moved'

export interface NotificationProfile {
  email: string
  telegram_chat_id: string
}

export interface NotificationPreference {
  id: number
  board: number | null
  channel: NotificationChannel
  event_type: NotificationEventType
  enabled: boolean
}

