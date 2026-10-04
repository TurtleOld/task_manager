import type {
  Board,
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
  PushDevice,
  PushTestResponse,
  VapidKeyResponse,
  SiteSettings,
  MyTodayResponse,
  ArchiveResponse,
  SearchResponse,
  AgendaResponse,
  FamilyTodayResponse,
  ChecklistItem,
  CardRecurrence,
  RecurrenceRule,
  CardComment,
  CardActivity,
  UserSessionInfo,
} from './types'

import { clearLocalSession, isSignedIn } from '../app/session'
import { readCsrfToken } from '../lib/csrf'

type ViteImportMeta = ImportMeta & {
  env?: {
    VITE_API_BASE_URL?: string
  }
}

export type UploadKind = 'file' | 'photo'

const BASE = (import.meta as ViteImportMeta).env?.VITE_API_BASE_URL || '/api'
const V1 = `${BASE}/v1`

export class ApiError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

export class NetworkError extends Error {
  constructor() {
    super('Network request failed')
    this.name = 'NetworkError'
  }
}

async function ensureOk(res: Response): Promise<void> {
  if (res.ok) return
  if (res.status === 401 && isSignedIn()) {
    void clearLocalSession()
  }
  throw new ApiError(res.status, await errorDetail(res))
}

async function json<T>(res: Response): Promise<T> {
  await ensureOk(res)
  const text = await res.text()
  if (!text.trim()) return null as T
  return JSON.parse(text) as T
}

async function ok(res: Response): Promise<void> {
  await ensureOk(res)
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

function csrfHeaders(): HeadersInit {
  return { 'X-CSRFToken': readCsrfToken() }
}

function jsonHeaders(): HeadersInit {
  return { 'Content-Type': 'application/json', ...csrfHeaders() }
}

async function ensureCsrfCookie(): Promise<void> {
  await ok(await fetch(`${V1}/auth/csrf/`))
}

export const api = {
  listBoards: async (): Promise<Board[]> => {
    const res = await fetch(`${V1}/boards/`, { headers: jsonHeaders() })
    return json(res)
  },
  createBoard: async (payload: { name: string; icon?: string; color?: string }): Promise<Board> => {
    const res = await fetch(`${V1}/boards/`, {
      method: 'POST',
      headers: jsonHeaders(),
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
      headers: jsonHeaders(),
      body: JSON.stringify(payload),
    })
    return json(res)
  },
  deleteBoard: async (id: number): Promise<void> => {
    const res = await fetch(`${V1}/boards/${id}/`, {
      method: 'DELETE',
      headers: jsonHeaders(),
    })
    return ok(res)
  },
  archiveBoard: async (id: number): Promise<Board> => {
    const res = await fetch(`${V1}/boards/${id}/archive/`, {
      method: 'POST',
      headers: jsonHeaders(),
    })
    return json(res)
  },
  unarchiveBoard: async (id: number): Promise<Board> => {
    const res = await fetch(`${V1}/boards/${id}/unarchive/`, {
      method: 'POST',
      headers: jsonHeaders(),
    })
    return json(res)
  },

  listCards: async (): Promise<Card[]> => {
    const res = await fetch(`${V1}/cards/`, { headers: jsonHeaders() })
    return json(res)
  },
  listCardsByBoard: async (boardId: number): Promise<Card[]> => {
    const res = await fetch(`${V1}/cards/?board=${boardId}`, { headers: jsonHeaders() })
    return json(res)
  },
  getCard: async (id: number): Promise<Card> => {
    const res = await fetch(`${V1}/cards/${id}/`, { headers: jsonHeaders() })
    return json(res)
  },
  listMyToday: async (): Promise<MyTodayResponse> => {
    const res = await fetch(`${V1}/cards/my-today/`, { headers: jsonHeaders() })
    return json(res)
  },
  getAgenda: async (listId?: number): Promise<AgendaResponse> => {
    const query = listId ? `?list=${listId}` : ''
    const res = await fetch(`${V1}/agenda/${query}`, { headers: jsonHeaders() })
    return json(res)
  },
  getCompletedAgenda: async (listId?: number): Promise<AgendaResponse> => {
    const query = listId ? `?list=${listId}` : ''
    const res = await fetch(`${V1}/agenda/completed/${query}`, { headers: jsonHeaders() })
    return json(res)
  },
  getFamilyToday: async (): Promise<FamilyTodayResponse> => {
    const res = await fetch(`${V1}/agenda/family-today/`, { headers: jsonHeaders() })
    return json(res)
  },
  completeCard: async (id: number): Promise<Card> => {
    const res = await fetch(`${V1}/cards/${id}/complete/`, {
      method: 'POST',
      headers: jsonHeaders(),
    })
    return json(res)
  },
  uncompleteCard: async (id: number): Promise<Card> => {
    const res = await fetch(`${V1}/cards/${id}/uncomplete/`, {
      method: 'POST',
      headers: jsonHeaders(),
    })
    return json(res)
  },
  createCard: async (board: number, title: string, description = ''): Promise<Card> => {
    const res = await fetch(`${V1}/cards/`, {
      method: 'POST',
      headers: jsonHeaders(),
      body: JSON.stringify({ board, title, description }),
    })
    return json(res)
  },
  createCardWithDetails: async (payload: {
    board: number
    title: string
    description?: string
    deadline?: string | null
    assignee?: number | null
    labels?: { name: string; color?: string }[]
  }): Promise<Card> => {
    const res = await fetch(`${V1}/cards/`, {
      method: 'POST',
      headers: jsonHeaders(),
      body: JSON.stringify(payload),
    })
    return json(res)
  },
  updateCard: async (
    id: number,
    payload: Partial<{
      title: string
      description: string
      assignee: number | null
      deadline: string | null
      priority: 0 | 1 | 2 | 3
      labels: { name: string; color?: string }[]
      is_shopping_list: boolean
    }>
  ): Promise<Card> => {
    const res = await fetch(`${V1}/cards/${id}/`, {
      method: 'PATCH',
      headers: jsonHeaders(),
      body: JSON.stringify(payload),
    })
    return json(res)
  },

  uploadCardAttachments: async (id: number, files: File[], type: UploadKind = 'file'): Promise<Card> => {
    const form = new FormData()
    form.append('type', type)
    for (const f of files) form.append('files', f)
    const res = await fetch(`${V1}/cards/${id}/attachments/`, {
      method: 'POST',
      headers: csrfHeaders(),
      body: form,
    }).catch(() => {
      throw new NetworkError()
    })
    return json(res)
  },

  addCardAttachment: async (
    id: number,
    payload: { name: string; type: 'link' | 'photo'; url: string }
  ): Promise<Card> => {
    const res = await fetch(`${V1}/cards/${id}/attachments/`, {
      method: 'POST',
      headers: jsonHeaders(),
      body: JSON.stringify(payload),
    })
    return json(res)
  },

  deleteCardAttachment: async (id: number, attachmentId: string): Promise<Card> => {
    const res = await fetch(`${V1}/cards/${id}/attachments/${encodeURIComponent(attachmentId)}/`, {
      method: 'DELETE',
      headers: csrfHeaders(),
    })
    return json(res)
  },
  listChecklist: async (cardId: number): Promise<ChecklistItem[]> => {
    const res = await fetch(`${V1}/cards/${cardId}/checklist/`, { headers: jsonHeaders() })
    return json(res)
  },
  addChecklistItem: async (cardId: number, payload: { text: string; done?: boolean }): Promise<ChecklistItem> => {
    const res = await fetch(`${V1}/cards/${cardId}/checklist/`, {
      method: 'POST',
      headers: jsonHeaders(),
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
      headers: jsonHeaders(),
      body: JSON.stringify(payload),
    })
    return json(res)
  },
  deleteChecklistItem: async (cardId: number, itemId: number): Promise<void> => {
    const res = await fetch(`${V1}/cards/${cardId}/checklist/${itemId}/`, {
      method: 'DELETE',
      headers: jsonHeaders(),
    })
    return ok(res)
  },

  addSubtask: async (
    cardId: number,
    payload: { title: string; deadline?: string | null; description?: string; assignee?: number | null; priority?: 0 | 1 | 2 | 3 }
  ): Promise<Card> => {
    const res = await fetch(`${V1}/cards/${cardId}/subtasks/`, {
      method: 'POST',
      headers: jsonHeaders(),
      body: JSON.stringify(payload),
    })
    return json(res)
  },

  deleteCard: async (id: number): Promise<void> => {
    const res = await fetch(`${V1}/cards/${id}/`, {
      method: 'DELETE',
      headers: jsonHeaders(),
    })
    return ok(res)
  },
  archiveCard: async (id: number): Promise<Card> => {
    const res = await fetch(`${V1}/cards/${id}/archive/`, {
      method: 'POST',
      headers: jsonHeaders(),
    })
    return json(res)
  },
  unarchiveCard: async (id: number): Promise<Card> => {
    const res = await fetch(`${V1}/cards/${id}/unarchive/`, {
      method: 'POST',
      headers: jsonHeaders(),
    })
    return json(res)
  },

  notifyCardUpdated: async (id: number): Promise<void> => {
    const res = await fetch(`${V1}/cards/${id}/notify-updated/`, {
      method: 'POST',
      headers: jsonHeaders(),
    })
    return ok(res)
  },

  listArchive: async (boardId?: number): Promise<ArchiveResponse> => {
    const query = boardId ? `?board=${boardId}` : ''
    const res = await fetch(`${V1}/archive/${query}`, { headers: jsonHeaders() })
    return json(res)
  },

  search: async (query: string): Promise<SearchResponse> => {
    const params = new URLSearchParams({ q: query })
    const res = await fetch(`${V1}/search/?${params.toString()}`, { headers: jsonHeaders() })
    return json(res)
  },

  registrationStatus: async (): Promise<RegistrationStatus> => {
    const res = await fetch(`${V1}/auth/registration-status/`, { headers: jsonHeaders() })
    return json(res)
  },
  register: async (payload: {
    username: string
    password: string
    full_name?: string
    role?: UserRole
  }): Promise<AuthUser> => {
    await ensureCsrfCookie()
    const res = await fetch(`${V1}/auth/register/`, {
      method: 'POST',
      headers: jsonHeaders(),
      body: JSON.stringify(payload),
    })
    return json(res)
  },
  login: async (payload: { username: string; password: string }): Promise<AuthUser> => {
    await ensureCsrfCookie()
    const res = await fetch(`${V1}/auth/login/`, {
      method: 'POST',
      headers: jsonHeaders(),
      body: JSON.stringify(payload),
    })
    return json(res)
  },
  /** The signed-in user, or null when this browser has no live session. */
  getCurrentUser: async (): Promise<AuthUser | null> => {
    const res = await fetch(`${V1}/auth/me/`, { headers: jsonHeaders() })
    if (res.status === 401) return null
    return json(res)
  },
  logout: async (): Promise<void> => {
    const send = () => fetch(`${V1}/auth/logout/`, { method: 'POST', headers: jsonHeaders() })
    let res = await send()
    // A stale CSRF cookie must not leave the server session (and its push
    // device) alive while the browser believes it signed out.
    if (res.status === 403) {
      await ensureCsrfCookie()
      res = await send()
    }
    return ok(res)
  },
  terminateSessions: async (): Promise<void> => {
    const res = await fetch(`${V1}/auth/terminate-sessions/`, {
      method: 'POST',
      headers: jsonHeaders(),
    })
    return ok(res)
  },
  listSessions: async (): Promise<UserSessionInfo[]> => {
    const res = await fetch(`${V1}/auth/sessions/`, { headers: jsonHeaders() })
    return json(res)
  },
  endSession: async (id: string): Promise<void> => {
    const res = await fetch(`${V1}/auth/sessions/${id}/`, {
      method: 'DELETE',
      headers: jsonHeaders(),
    })
    return ok(res)
  },
  updateCurrentUser: async (payload: Partial<{ full_name: string }>): Promise<UserProfile> => {
    const res = await fetch(`${V1}/auth/me/`, {
      method: 'PATCH',
      headers: jsonHeaders(),
      body: JSON.stringify(payload),
    })
    return json(res)
  },
  listUsers: async (): Promise<AdminUser[]> => {
    const res = await fetch(`${V1}/users/`, { headers: jsonHeaders() })
    return json(res)
  },
  updateUser: async (
    id: number,
    payload: Partial<{ full_name: string; role: UserRole }>
  ): Promise<AdminUser> => {
    const res = await fetch(`${V1}/users/${id}/`, {
      method: 'PATCH',
      headers: jsonHeaders(),
      body: JSON.stringify(payload),
    })
    return json(res)
  },
  changeUserPassword: async (
    id: number,
    payload: { new_password: string; current_password?: string },
  ): Promise<{ detail: string }> => {
    const res = await fetch(`${V1}/users/${id}/change-password/`, {
      method: 'POST',
      headers: jsonHeaders(),
      body: JSON.stringify(payload),
    })
    return json(res)
  },

  getNotificationProfile: async (): Promise<NotificationProfile> => {
    const res = await fetch(`${V1}/notifications/profile/`, { headers: jsonHeaders() })
    return json(res)
  },
  getNotificationInbox: async (params?: { limit?: number; unreadOnly?: boolean }): Promise<NotificationInboxResponse> => {
    const query = new URLSearchParams()
    if (params?.limit) query.set('limit', String(params.limit))
    if (params?.unreadOnly) query.set('unread_only', 'true')
    const suffix = query.toString() ? `?${query.toString()}` : ''
    const res = await fetch(`${V1}/notifications/inbox/${suffix}`, { headers: jsonHeaders() })
    return json(res)
  },
  markNotificationInboxRead: async (payload: { ids?: number[]; mark_all?: boolean }): Promise<{ updated: number }> => {
    const res = await fetch(`${V1}/notifications/inbox/`, {
      method: 'PATCH',
      headers: jsonHeaders(),
      body: JSON.stringify(payload),
    })
    return json(res)
  },
  updateNotificationProfile: async (payload: Partial<NotificationProfile>): Promise<NotificationProfile> => {
    const res = await fetch(`${V1}/notifications/profile/`, {
      method: 'PATCH',
      headers: jsonHeaders(),
      body: JSON.stringify(payload),
    })
    return json(res)
  },

  listPushDevices: async (): Promise<PushDevice[]> => {
    const res = await fetch(`${V1}/push-devices/`, { headers: jsonHeaders() })
    return json(res)
  },
  registerPushDevice: async (payload: {
    endpoint: string
    keys: { p256dh: string; auth: string }
    label?: string
  }): Promise<PushDevice> => {
    const res = await fetch(`${V1}/push-devices/`, {
      method: 'POST',
      headers: jsonHeaders(),
      body: JSON.stringify(payload),
    })
    return json(res)
  },
  deletePushDevice: async (id: number): Promise<void> => {
    const res = await fetch(`${V1}/push-devices/${id}/`, {
      method: 'DELETE',
      headers: jsonHeaders(),
    })
    return ok(res)
  },
  testPushDevice: async (): Promise<PushTestResponse> => {
    const res = await fetch(`${V1}/push-devices/test/`, {
      method: 'POST',
      headers: jsonHeaders(),
    })
    return json(res)
  },
  getVapidKey: async (): Promise<VapidKeyResponse> => {
    const res = await fetch(`${V1}/notifications/vapid-key/`, { headers: jsonHeaders() })
    return json(res)
  },

  getCardDeadlineReminder: async (cardId: number): Promise<CardDeadlineReminderResponse> => {
    const res = await fetch(`${V1}/cards/${cardId}/deadline-reminder/`, { headers: jsonHeaders() })
    return json(res)
  },
  saveCardDeadlineReminder: async (
    cardId: number,
    payload: { reminders: Array<Pick<CardDeadlineReminder, 'enabled' | 'offset_value' | 'offset_unit'>> }
  ): Promise<CardDeadlineReminder[]> => {
    const res = await fetch(`${V1}/cards/${cardId}/deadline-reminder/`, {
      method: 'PUT',
      headers: jsonHeaders(),
      body: JSON.stringify(payload),
    })
    return json(res)
  },
  deleteCardDeadlineReminder: async (cardId: number): Promise<void> => {
    const res = await fetch(`${V1}/cards/${cardId}/deadline-reminder/`, {
      method: 'DELETE',
      headers: jsonHeaders(),
    })
    return ok(res)
  },
  getCardRecurrence: async (cardId: number): Promise<CardRecurrence | null> => {
    const res = await fetch(`${V1}/cards/${cardId}/recurrence/`, { headers: jsonHeaders() })
    if (res.status === 404) return null
    return json(res)
  },
  saveCardRecurrence: async (
    cardId: number,
    payload: Pick<RecurrenceRule, 'freq' | 'interval' | 'byweekday' | 'byday' | 'bysetpos' | 'until' | 'count'>
  ): Promise<RecurrenceRule> => {
    const res = await fetch(`${V1}/cards/${cardId}/recurrence/`, {
      method: 'PUT',
      headers: jsonHeaders(),
      body: JSON.stringify(payload),
    })
    return json(res)
  },
  deleteCardRecurrence: async (cardId: number): Promise<void> => {
    const res = await fetch(`${V1}/cards/${cardId}/recurrence/`, {
      method: 'DELETE',
      headers: jsonHeaders(),
    })
    return ok(res)
  },
  listCardComments: async (cardId: number): Promise<CardComment[]> => {
    const res = await fetch(`${V1}/cards/${cardId}/comments/`, { headers: jsonHeaders() })
    return json(res)
  },
  addCardComment: async (cardId: number, payload: { text: string }): Promise<CardComment> => {
    const res = await fetch(`${V1}/cards/${cardId}/comments/`, {
      method: 'POST',
      headers: jsonHeaders(),
      body: JSON.stringify(payload),
    })
    return json(res)
  },
  updateCardComment: async (cardId: number, commentId: number, payload: { text: string }): Promise<CardComment> => {
    const res = await fetch(`${V1}/cards/${cardId}/comments/${commentId}/`, {
      method: 'PATCH',
      headers: jsonHeaders(),
      body: JSON.stringify(payload),
    })
    return json(res)
  },
  deleteCardComment: async (cardId: number, commentId: number): Promise<void> => {
    const res = await fetch(`${V1}/cards/${cardId}/comments/${commentId}/`, {
      method: 'DELETE',
      headers: jsonHeaders(),
    })
    return ok(res)
  },
  listCardActivity: async (cardId: number): Promise<CardActivity[]> => {
    const res = await fetch(`${V1}/cards/${cardId}/activity/`, { headers: jsonHeaders() })
    return json(res)
  },
  listNotificationPreferences: async (boardId?: number): Promise<NotificationPreference[]> => {
    const query = boardId ? `?board=${boardId}` : ''
    const res = await fetch(`${V1}/notification-preferences/${query}`, { headers: jsonHeaders() })
    return json(res)
  },
  createNotificationPreference: async (
    payload: Omit<NotificationPreference, 'id'>
  ): Promise<NotificationPreference> => {
    const res = await fetch(`${V1}/notification-preferences/`, {
      method: 'POST',
      headers: jsonHeaders(),
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
      headers: jsonHeaders(),
      body: JSON.stringify(payload),
    })
    return json(res)
  },
  deleteNotificationPreference: async (id: number): Promise<void> => {
    const res = await fetch(`${V1}/notification-preferences/${id}/`, {
      method: 'DELETE',
      headers: jsonHeaders(),
    })
    return ok(res)
  },

  getSiteSettings: async (): Promise<SiteSettings> => {
    const res = await fetch(`${V1}/settings/site/`, { headers: jsonHeaders() })
    return json(res)
  },
  updateSiteSettings: async (payload: Partial<SiteSettings>): Promise<SiteSettings> => {
    const res = await fetch(`${V1}/settings/site/`, {
      method: 'PATCH',
      headers: jsonHeaders(),
      body: JSON.stringify(payload),
    })
    return json(res)
  },
}
