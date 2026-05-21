import type {
  Board,
  BoardTemplate,
  Column,
  Card,
  AuthUser,
  UserProfile,
  RegistrationStatus,
  UserRole,
  AdminUser,
  NotificationInboxResponse,
  NotificationProfile,
  NotificationPreference,
  CardDeadlineReminderResponse,
  CardDeadlineReminder,
  SiteSettings,
  MyTodayResponse,
  InboxResponse,
  InboxSchedule,
  ArchiveResponse,
  SearchResponse,
  ChecklistItem,
  RecurrenceRule,
  CardComment,
  CardActivity,
} from './types'

type ViteImportMeta = ImportMeta & {
  env?: {
    VITE_API_BASE_URL?: string
  }
}

const BASE = (import.meta as ViteImportMeta).env?.VITE_API_BASE_URL || '/api'
const V1 = `${BASE}/v1`

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) {
    throw new Error(await errorDetail(res))
  }
  const text = await res.text()
  if (!text.trim()) return null as T
  return JSON.parse(text) as T
}

async function ok(res: Response): Promise<void> {
  if (!res.ok) {
    throw new Error(await errorDetail(res))
  }
}

async function errorDetail(res: Response): Promise<string> {
  const contentType = res.headers.get('content-type') || ''
  const text = await res.text()

  if (contentType.includes('application/json')) {
    try {
      const parsed = JSON.parse(text) as { detail?: string; [key: string]: unknown }
      if (typeof parsed.detail === 'string' && parsed.detail.trim()) return parsed.detail
      const firstFieldError = Object.values(parsed).flat().find((item) => typeof item === 'string')
      if (typeof firstFieldError === 'string' && firstFieldError.trim()) return firstFieldError
    } catch {
      // Fall through to generic HTTP message.
    }
  }

  if (contentType.includes('text/html') || /^\s*<!doctype html/i.test(text) || /^\s*<html/i.test(text)) {
    return `HTTP ${res.status}: ${res.statusText || 'Ошибка сервера'}`
  }

  return text.trim() ? `HTTP ${res.status}: ${text}` : `HTTP ${res.status}: ${res.statusText || 'Ошибка сервера'}`
}

function authHeaders(): HeadersInit {
  const token = localStorage.getItem('auth_token')
  if (!token) return { 'Content-Type': 'application/json' }
  return { 'Content-Type': 'application/json', Authorization: `Token ${token}` }
}

function authOnlyHeaders(): HeadersInit {
  const token = localStorage.getItem('auth_token')
  if (!token) return {}
  return { Authorization: `Token ${token}` }
}

export const api = {
  // Boards
  listBoards: async (): Promise<Board[]> => {
    const res = await fetch(`${V1}/boards/`, { headers: authHeaders() })
    return json(res)
  },
  createBoard: async (payload: { name: string; icon?: string; color?: string }): Promise<Board> => {
    const res = await fetch(`${V1}/boards/`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(payload),
    })
    return json(res)
  },
  listBoardTemplates: async (): Promise<BoardTemplate[]> => {
    const res = await fetch(`${V1}/boards/templates/`, { headers: authHeaders() })
    return json(res)
  },
  createBoardFromTemplate: async (payload: { template_id: string; name?: string }): Promise<Board> => {
    const res = await fetch(`${V1}/boards/from-template/`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(payload),
    })
    return json(res)
  },
  updateBoard: async (
    id: number,
    payload: Partial<{ name: string; icon: string; color: string }>
  ): Promise<Board> => {
    const res = await fetch(`${V1}/boards/${id}/`, {
      method: 'PATCH',
      headers: authHeaders(),
      body: JSON.stringify(payload),
    })
    return json(res)
  },
  deleteBoard: async (id: number): Promise<void> => {
    const res = await fetch(`${V1}/boards/${id}/`, {
      method: 'DELETE',
      headers: authHeaders(),
    })
    return ok(res)
  },
  archiveBoard: async (id: number): Promise<Board> => {
    const res = await fetch(`${V1}/boards/${id}/archive/`, {
      method: 'POST',
      headers: authHeaders(),
    })
    return json(res)
  },
  unarchiveBoard: async (id: number): Promise<Board> => {
    const res = await fetch(`${V1}/boards/${id}/unarchive/`, {
      method: 'POST',
      headers: authHeaders(),
    })
    return json(res)
  },
  forceDeleteBoard: async (id: number): Promise<void> => {
    const res = await fetch(`${V1}/boards/${id}/force-delete/`, {
      method: 'DELETE',
      headers: authHeaders(),
    })
    return ok(res)
  },

  // Columns
  listColumns: async (boardId: number): Promise<Column[]> => {
    const res = await fetch(`${V1}/columns/?board=${boardId}`, { headers: authHeaders() })
    return json(res)
  },
  createColumn: async (board: number, name: string, icon: string): Promise<Column> => {
    const res = await fetch(`${V1}/columns/`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ board, name, icon }),
    })
    return json(res)
  },
  moveColumn: async (
    id: number,
    payload: Partial<{ before_id: number; after_id: number }>
  ): Promise<Column> => {
    const res = await fetch(`${V1}/columns/${id}/move/`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(payload),
    })
    return json(res)
  },

  // Cards
  listCards: async (): Promise<Card[]> => {
    const res = await fetch(`${V1}/cards/`, { headers: authHeaders() })
    return json(res)
  },
  listCardsByBoard: async (boardId: number): Promise<Card[]> => {
    const res = await fetch(`${V1}/cards/?board=${boardId}`, { headers: authHeaders() })
    return json(res)
  },
  listCardsByColumn: async (columnId: number): Promise<Card[]> => {
    const res = await fetch(`${V1}/cards/?column=${columnId}`, { headers: authHeaders() })
    return json(res)
  },
  listMyToday: async (): Promise<MyTodayResponse> => {
    const res = await fetch(`${V1}/cards/my-today/`, { headers: authHeaders() })
    return json(res)
  },
  createCard: async (column: number, title: string, description = ''): Promise<Card> => {
    const res = await fetch(`${V1}/cards/`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ column, title, description }),
    })
    return json(res)
  },
  createCardWithDetails: async (payload: {
    column: number
    title: string
    description?: string
    deadline?: string | null
  }): Promise<Card> => {
    const res = await fetch(`${V1}/cards/`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(payload),
    })
    return json(res)
  },
  updateCard: async (
    id: number,
    payload: Partial<{
      column: number
      title: string
      description: string
      assignee: number | null
      deadline: string | null
      priority: 0 | 1 | 2 | 3
      labels: { name: string; color?: string }[]
    }>
  ): Promise<Card> => {
    const res = await fetch(`${V1}/cards/${id}/`, {
      method: 'PATCH',
      headers: authHeaders(),
      body: JSON.stringify(payload),
    })
    return json(res)
  },

  uploadCardAttachments: async (id: number, files: File[], type: 'file' | 'photo' = 'file'): Promise<Card> => {
    const form = new FormData()
    form.append('type', type)
    for (const f of files) form.append('files', f)
    const res = await fetch(`${V1}/cards/${id}/attachments/`, {
      method: 'POST',
      headers: authOnlyHeaders(),
      body: form,
    })
    return json(res)
  },

  addCardAttachment: async (
    id: number,
    payload: { name: string; type: 'link' | 'photo'; url: string }
  ): Promise<Card> => {
    const res = await fetch(`${V1}/cards/${id}/attachments/`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(payload),
    })
    return json(res)
  },

  deleteCardAttachment: async (id: number, attachmentId: string): Promise<Card> => {
    const res = await fetch(`${V1}/cards/${id}/attachments/${encodeURIComponent(attachmentId)}/`, {
      method: 'DELETE',
      headers: authOnlyHeaders(),
    })
    return json(res)
  },
  // Checklist items
  listChecklist: async (cardId: number): Promise<ChecklistItem[]> => {
    const res = await fetch(`${V1}/cards/${cardId}/checklist/`, { headers: authHeaders() })
    return json(res)
  },
  addChecklistItem: async (cardId: number, payload: { text: string; done?: boolean }): Promise<ChecklistItem> => {
    const res = await fetch(`${V1}/cards/${cardId}/checklist/`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(payload),
    })
    return json(res)
  },
  updateChecklistItem: async (
    cardId: number,
    itemId: number,
    payload: Partial<{ text: string; done: boolean; position: number }>
  ): Promise<ChecklistItem> => {
    const res = await fetch(`${V1}/cards/${cardId}/checklist/${itemId}/`, {
      method: 'PATCH',
      headers: authHeaders(),
      body: JSON.stringify(payload),
    })
    return json(res)
  },
  deleteChecklistItem: async (cardId: number, itemId: number): Promise<void> => {
    const res = await fetch(`${V1}/cards/${cardId}/checklist/${itemId}/`, {
      method: 'DELETE',
      headers: authHeaders(),
    })
    return ok(res)
  },

  addSubtask: async (
    cardId: number,
    payload: { title: string; deadline?: string | null; description?: string; assignee?: number | null; priority?: 0 | 1 | 2 | 3 }
  ): Promise<Card> => {
    const res = await fetch(`${V1}/cards/${cardId}/subtasks/`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(payload),
    })
    return json(res)
  },

  deleteCard: async (id: number): Promise<void> => {
    const res = await fetch(`${V1}/cards/${id}/`, {
      method: 'DELETE',
      headers: authHeaders(),
    })
    return ok(res)
  },
  restoreCard: async (id: number): Promise<Card> => {
    const res = await fetch(`${V1}/cards/${id}/restore/`, {
      method: 'POST',
      headers: authHeaders(),
    })
    return json(res)
  },
  moveCard: async (
    id: number,
    payload: Partial<{ to_column: number; before_id: number; after_id: number; expected_version: number }>
  ): Promise<Card> => {
    const res = await fetch(`${V1}/cards/${id}/move/`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(payload),
    })
    return json(res)
  },
  restoreColumn: async (id: number): Promise<Column> => {
    const res = await fetch(`${V1}/columns/${id}/restore/`, {
      method: 'POST',
      headers: authHeaders(),
    })
    return json(res)
  },

  notifyCardUpdated: async (
    id: number,
    payload: { version: number; description?: string; changes?: string[]; changes_meta?: Record<string, unknown> }
  ): Promise<{ event_id: number | null; dedupe_key: string }> => {
    const res = await fetch(`${V1}/cards/${id}/notify-updated/`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(payload),
    })
    return json(res)
  },

  notifyCardDeleted: async (payload: {
    card_id: number
    version: number
    board?: number
    column?: number
    card_title?: string
  }): Promise<{ event_id: number | null; dedupe_key: string }> => {
    const res = await fetch(`${V1}/cards/notify-deleted/`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(payload),
    })
    return json(res)
  },

  getInbox: async (): Promise<InboxResponse> => {
    const res = await fetch(`${V1}/inbox/`, { headers: authHeaders() })
    return json(res)
  },
  createInboxCard: async (payload: {
    title: string
    description?: string
    deadline?: string | null
    priority?: 0 | 1 | 2 | 3
  }): Promise<Card> => {
    const res = await fetch(`${V1}/inbox/`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(payload),
    })
    return json(res)
  },
  createInboxSchedule: async (payload: { target_column: number; move_at: string }): Promise<InboxSchedule> => {
    const res = await fetch(`${V1}/inbox/schedules/`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(payload),
    })
    return json(res)
  },
  cancelInboxSchedule: async (id: number): Promise<InboxSchedule> => {
    const res = await fetch(`${V1}/inbox/schedules/${id}/`, {
      method: 'DELETE',
      headers: authHeaders(),
    })
    return json(res)
  },

  listArchive: async (boardId?: number): Promise<ArchiveResponse> => {
    const query = boardId ? `?board=${boardId}` : ''
    const res = await fetch(`${V1}/archive/${query}`, { headers: authHeaders() })
    return json(res)
  },

  search: async (query: string): Promise<SearchResponse> => {
    const params = new URLSearchParams({ q: query })
    const res = await fetch(`${V1}/search/?${params.toString()}`, { headers: authHeaders() })
    return json(res)
  },

  registrationStatus: async (): Promise<RegistrationStatus> => {
    const res = await fetch(`${V1}/auth/registration-status/`, { headers: authHeaders() })
    return json(res)
  },
  register: async (payload: {
    username: string
    password: string
    full_name?: string
    role?: UserRole
  }): Promise<AuthUser> => {
    const res = await fetch(`${V1}/auth/register/`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(payload),
    })
    return json(res)
  },
  login: async (payload: { username: string; password: string }): Promise<AuthUser> => {
    const res = await fetch(`${V1}/auth/login/`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(payload),
    })
    return json(res)
  },
  terminateSessions: async (): Promise<void> => {
    const res = await fetch(`${V1}/auth/terminate-sessions/`, {
      method: 'POST',
      headers: authHeaders(),
    })
    if (!res.ok) throw new Error(`${res.status}`)
  },
  updateCurrentUser: async (payload: Partial<{ full_name: string }>): Promise<UserProfile> => {
    const res = await fetch(`${V1}/auth/me/`, {
      method: 'PATCH',
      headers: authHeaders(),
      body: JSON.stringify(payload),
    })
    return json(res)
  },
  // Users (admin)
  listUsers: async (): Promise<AdminUser[]> => {
    const res = await fetch(`${V1}/users/`, { headers: authHeaders() })
    return json(res)
  },
  updateUser: async (
    id: number,
    payload: Partial<{ full_name: string; role: UserRole }>
  ): Promise<AdminUser> => {
    const res = await fetch(`${V1}/users/${id}/`, {
      method: 'PATCH',
      headers: authHeaders(),
      body: JSON.stringify(payload),
    })
    return json(res)
  },
  changeUserPassword: async (id: number, payload: { new_password: string }): Promise<{ detail: string }> => {
    const res = await fetch(`${V1}/users/${id}/change-password/`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(payload),
    })
    return json(res)
  },

  // Notifications
  getNotificationProfile: async (): Promise<NotificationProfile> => {
    const res = await fetch(`${V1}/notifications/profile/`, { headers: authHeaders() })
    return json(res)
  },
  getNotificationInbox: async (params?: { limit?: number; unreadOnly?: boolean }): Promise<NotificationInboxResponse> => {
    const query = new URLSearchParams()
    if (params?.limit) query.set('limit', String(params.limit))
    if (params?.unreadOnly) query.set('unread_only', 'true')
    const suffix = query.toString() ? `?${query.toString()}` : ''
    const res = await fetch(`${V1}/notifications/inbox/${suffix}`, { headers: authHeaders() })
    return json(res)
  },
  markNotificationInboxRead: async (payload: { ids?: number[]; mark_all?: boolean }): Promise<{ updated: number }> => {
    const res = await fetch(`${V1}/notifications/inbox/`, {
      method: 'PATCH',
      headers: authHeaders(),
      body: JSON.stringify(payload),
    })
    return json(res)
  },
  updateNotificationProfile: async (payload: Partial<NotificationProfile>): Promise<NotificationProfile> => {
    const res = await fetch(`${V1}/notifications/profile/`, {
      method: 'PATCH',
      headers: authHeaders(),
      body: JSON.stringify(payload),
    })
    return json(res)
  },

  // Card deadline reminders (per-user)
  getCardDeadlineReminder: async (cardId: number): Promise<CardDeadlineReminderResponse> => {
    const res = await fetch(`${V1}/cards/${cardId}/deadline-reminder/`, { headers: authHeaders() })
    return json(res)
  },
  saveCardDeadlineReminder: async (
    cardId: number,
    payload: { reminders: Array<Pick<CardDeadlineReminder, 'enabled' | 'offset_value' | 'offset_unit' | 'channel'>> }
  ): Promise<CardDeadlineReminder[]> => {
    const res = await fetch(`${V1}/cards/${cardId}/deadline-reminder/`, {
      method: 'PUT',
      headers: authHeaders(),
      body: JSON.stringify(payload),
    })
    return json(res)
  },
  deleteCardDeadlineReminder: async (cardId: number): Promise<void> => {
    const res = await fetch(`${V1}/cards/${cardId}/deadline-reminder/`, {
      method: 'DELETE',
      headers: authHeaders(),
    })
    return ok(res)
  },
  getCardRecurrence: async (cardId: number): Promise<RecurrenceRule | null> => {
    const res = await fetch(`${V1}/cards/${cardId}/recurrence/`, { headers: authHeaders() })
    if (res.status === 404) return null
    return json(res)
  },
  saveCardRecurrence: async (
    cardId: number,
    payload: Pick<RecurrenceRule, 'freq' | 'interval' | 'byweekday' | 'byday' | 'bysetpos' | 'until' | 'count'>
  ): Promise<RecurrenceRule> => {
    const res = await fetch(`${V1}/cards/${cardId}/recurrence/`, {
      method: 'PUT',
      headers: authHeaders(),
      body: JSON.stringify(payload),
    })
    return json(res)
  },
  deleteCardRecurrence: async (cardId: number): Promise<void> => {
    const res = await fetch(`${V1}/cards/${cardId}/recurrence/`, {
      method: 'DELETE',
      headers: authHeaders(),
    })
    return ok(res)
  },
  listCardComments: async (cardId: number): Promise<CardComment[]> => {
    const res = await fetch(`${V1}/cards/${cardId}/comments/`, { headers: authHeaders() })
    return json(res)
  },
  addCardComment: async (cardId: number, payload: { text: string }): Promise<CardComment> => {
    const res = await fetch(`${V1}/cards/${cardId}/comments/`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(payload),
    })
    return json(res)
  },
  updateCardComment: async (cardId: number, commentId: number, payload: { text: string }): Promise<CardComment> => {
    const res = await fetch(`${V1}/cards/${cardId}/comments/${commentId}/`, {
      method: 'PATCH',
      headers: authHeaders(),
      body: JSON.stringify(payload),
    })
    return json(res)
  },
  deleteCardComment: async (cardId: number, commentId: number): Promise<void> => {
    const res = await fetch(`${V1}/cards/${cardId}/comments/${commentId}/`, {
      method: 'DELETE',
      headers: authHeaders(),
    })
    return ok(res)
  },
  listCardActivity: async (cardId: number): Promise<CardActivity[]> => {
    const res = await fetch(`${V1}/cards/${cardId}/activity/`, { headers: authHeaders() })
    return json(res)
  },
  listNotificationPreferences: async (boardId?: number): Promise<NotificationPreference[]> => {
    const query = boardId ? `?board=${boardId}` : ''
    const res = await fetch(`${V1}/notification-preferences/${query}`, { headers: authHeaders() })
    return json(res)
  },
  createNotificationPreference: async (
    payload: Omit<NotificationPreference, 'id'>
  ): Promise<NotificationPreference> => {
    const res = await fetch(`${V1}/notification-preferences/`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(payload),
    })
    return json(res)
  },
  updateNotificationPreference: async (
    id: number,
    payload: Partial<NotificationPreference>
  ): Promise<NotificationPreference> => {
    const res = await fetch(`${V1}/notification-preferences/${id}/`, {
      method: 'PATCH',
      headers: authHeaders(),
      body: JSON.stringify(payload),
    })
    return json(res)
  },
  deleteNotificationPreference: async (id: number): Promise<void> => {
    const res = await fetch(`${V1}/notification-preferences/${id}/`, {
      method: 'DELETE',
      headers: authHeaders(),
    })
    return ok(res)
  },

  // Site settings
  getSiteSettings: async (): Promise<SiteSettings> => {
    const res = await fetch(`${V1}/settings/site/`, { headers: authHeaders() })
    return json(res)
  },
  updateSiteSettings: async (payload: Partial<SiteSettings>): Promise<SiteSettings> => {
    const res = await fetch(`${V1}/settings/site/`, {
      method: 'PATCH',
      headers: authHeaders(),
      body: JSON.stringify(payload),
    })
    return json(res)
  },
}
