// Generated via openapi-typescript normally; minimal hand-written fallback
export interface ChecklistItem {
  id: number
  text: string
  done: boolean
  position: number
}

export interface Board {
  id: number
  name: string
  icon: string
  color: string
  archived_at: string | null
  created_at: string
  updated_at: string
  version: number
}

export interface BoardTemplate {
  id: string
  name: string
  icon: string
  color: string
}

export interface Column {
  id: number
  board: number
  name: string
  icon: string
  position: string
  is_default: boolean
  is_done: boolean
  archived_at: string | null
  created_at: string
  updated_at: string
  version: number
}

export interface Card {
  id: number
  board: number
  column: number
  parent: number | null
  assignee: number | null
  title: string
  description: string
  deadline: string | null
  priority: 0 | 1 | 2 | 3
  priority_label?: string
  labels: { name: string; color: string }[]
  checklist: ChecklistItem[]
  subtasks: Card[]
  attachments: {
    id: string
    name: string
    type: 'file' | 'link' | 'photo'
    url?: string
    mime?: string
    mimeType?: string
    size?: number
    uploaded_by?: number | null
    uploadedBy?: number | null
    created_at?: string
    createdAt?: string
  }[]
  position: string
  created_at: string
  updated_at: string
  version: number
  archived_at: string | null
  is_done: boolean
  parent_recurrence: number | null
  recurrence: RecurrenceRule | null
}

export interface RecurrenceRule {
  id: number
  card: number
  freq: 'daily' | 'weekly' | 'monthly' | 'yearly'
  interval: number
  byweekday: number[]
  byday: number | null
  bysetpos: number | null
  until: string | null
  count: number | null
  generated_count: number
  next_due: string | null
  last_generated_at: string | null
  created_at: string
  updated_at: string
  version: number
}

export interface CardComment {
  id: number
  card: number
  author: number
  author_name: string
  author_username: string
  text: string
  created_at: string
  edited_at: string | null
  can_edit: boolean
}

export interface CardActivity {
  id: number
  card: number
  actor: number | null
  actor_name: string
  actor_username: string | null
  action: string
  before: Record<string, unknown>
  after: Record<string, unknown>
  created_at: string
}

export interface MyTodayCard extends Card {
  board_name: string
  column_name: string
  done_column: number | null
}

export interface MyTodayResponse {
  overdue: MyTodayCard[]
  today: MyTodayCard[]
  important: MyTodayCard[]
}

export interface InboxResponse {
  board: Board
  column: Column
  cards: Card[]
}

export interface ArchivedCard extends Card {
  board_name: string
  column_name: string
}

export interface ArchivedColumn extends Column {
  board_name: string
}

export interface ArchiveResponse {
  cards: ArchivedCard[]
  columns: ArchivedColumn[]
  boards: Board[]
}

export interface SearchCardResult {
  id: number
  title: string
  description: string
  board: number
  board_name: string
  column: number
  column_name: string
  deadline: string | null
  priority: 0 | 1 | 2 | 3
}

export interface SearchBoardResult {
  id: number
  name: string
}

export interface SearchResponse {
  cards: SearchCardResult[]
  boards: SearchBoardResult[]
}

export interface AuthUser {
  id: number
  username: string
  full_name: string
  is_admin: boolean
  role?: UserRole
  token: string
}

export interface UserProfile {
  id: number
  username: string
  full_name: string
  is_admin: boolean
  role?: UserRole
}

export type UserRole = 'owner' | 'member'

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

export type NotificationChannel = 'email' | 'telegram' | 'push'

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
  | 'comment.created'
  | 'comment.updated'
  | 'comment.deleted'
  | 'card.deadline_reminder'

export interface NotificationProfile {
  email: string
  telegram_chat_id: string
  fcm_token?: string
  timezone: string
  timezone_configured: boolean
}

export interface NotificationInboxItem {
  id: number
  event_id: number
  event_type: NotificationEventType
  summary: string
  message: string
  link: string
  route: string
  created_at: string
  read_at: string | null
  unread: boolean
}

export interface NotificationInboxResponse {
  results: NotificationInboxItem[]
  unread_count: number
}

export interface SiteSettings {
  overdue_reminder_interval: number
}

export type ReminderOffsetUnit = 'minutes' | 'hours'

export type ReminderChannel = 'email' | 'telegram' | 'push'

export interface CardDeadlineReminder {
  id: number
  order: number
  enabled: boolean
  offset_value: number
  offset_unit: ReminderOffsetUnit
  channel: ReminderChannel | null
  scheduled_at: string | null
  status:
    | 'disabled'
    | 'scheduled'
    | 'sent'
    | 'skipped'
    | 'failed'
    | 'invalid.no_deadline'
    | 'invalid.past'
    | 'invalid.channel'
  last_error: string
  sent_at: string | null
}

export interface ReminderChannelInfo {
  available: boolean
  reason: string
}

export interface CardDeadlineReminderResponse {
  reminders: CardDeadlineReminder[]
  channels: {
    email: ReminderChannelInfo
    telegram: ReminderChannelInfo
    push: ReminderChannelInfo
  }
  deadline: string | null
}

export interface NotificationPreference {
  id: number
  board: number | null
  channel: NotificationChannel
  event_type: NotificationEventType
  enabled: boolean
}
