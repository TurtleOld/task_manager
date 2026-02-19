import type {
  Board,
  Column,
  Card,
  AuthUser,
  RegistrationStatus,
  PermissionKey,
  UserRole,
  AdminUser,
  NotificationProfile,
  NotificationPreference,
  CardDeadlineReminderResponse,
  CardDeadlineReminder,
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
    const text = await res.text()
    throw new Error(`HTTP ${res.status}: ${text}`)
  }
  return res.json() as Promise<T>
}

async function ok(res: Response): Promise<void> {
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`HTTP ${res.status}: ${text}`)
  }
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
  createBoard: async (name: string): Promise<Board> => {
    const res = await fetch(`${V1}/boards/`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ name }),
    })
    return json(res)
  },
  updateBoard: async (
    id: number,
    payload: Partial<{ name: string; notification_email: string; notification_telegram_chat_id: string }>
  ): Promise<Board> => {
    const res = await fetch(`${V1}/boards/${id}/`, {
      method: 'PATCH',
      headers: authHeaders(),
      body: JSON.stringify(payload),
    })
    return json(res)
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

  // Cards
  listCardsByBoard: async (boardId: number): Promise<Card[]> => {
    const res = await fetch(`${V1}/cards/?board=${boardId}`, { headers: authHeaders() })
    return json(res)
  },
  listCardsByColumn: async (columnId: number): Promise<Card[]> => {
    const res = await fetch(`${V1}/cards/?column=${columnId}`, { headers: authHeaders() })
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
  updateCard: async (
    id: number,
    payload: Partial<{
      column: number
      title: string
      description: string
      assignee: number | null
      deadline: string | null
      priority: string
      tags: string[]
      categories: string[]
      checklist: { id: string; text: string; done: boolean }[]
      attachments: { id: string; name: string; type: 'file' | 'link' | 'photo'; url?: string }[]
    }>
  ): Promise<Card> => {
    const res = await fetch(`${V1}/cards/${id}/`, {
      method: 'PATCH',
      headers: authHeaders(),
      body: JSON.stringify(payload),
    })
    return json(res)
  },

  uploadCardAttachments: async (id: number, files: File[]): Promise<Card> => {
    const form = new FormData()
    for (const f of files) form.append('files', f)
    const res = await fetch(`${V1}/cards/${id}/attachments/`, {
      method: 'POST',
      headers: authOnlyHeaders(),
      body: form,
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
  deleteCard: async (id: number): Promise<void> => {
    const res = await fetch(`${V1}/cards/${id}/`, {
      method: 'DELETE',
      headers: authHeaders(),
    })
    return ok(res)
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

  registrationStatus: async (): Promise<RegistrationStatus> => {
    const res = await fetch(`${V1}/auth/registration-status/`, { headers: authHeaders() })
    return json(res)
  },
  register: async (payload: {
    username: string
    password: string
    full_name?: string
    role?: UserRole
    permissions?: PermissionKey[]
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
  // Users (admin)
  listUsers: async (): Promise<AdminUser[]> => {
    const res = await fetch(`${V1}/users/`, { headers: authHeaders() })
    return json(res)
  },
  updateUser: async (
    id: number,
    payload: Partial<{ full_name: string; role: UserRole; permissions: PermissionKey[] }>
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
}
