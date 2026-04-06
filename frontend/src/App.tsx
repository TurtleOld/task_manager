import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Link,
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useParams,
} from 'react-router-dom'
import OneSignal from 'react-onesignal'
import { api } from './api/client'
import { useBoardWebSocket } from './useBoardWebSocket'
import type { BoardEvent } from './useBoardWebSocket'
import type {
  AuthUser,
  Board,
  Column,
  Card,
  RegistrationStatus,
  PermissionKey,
  UserRole,
  AdminUser,
  NotificationProfile,
  NotificationPreference,
  NotificationChannel,
  NotificationEventType,
  CardDeadlineReminderResponse,
  CardDeadlineReminder,
} from './api/types'

const AUTH_TOKEN_KEY = 'auth_token'
const AUTH_USER_KEY = 'auth_user'
const THEME_KEY = 'theme'

const permissionCatalog: { key: PermissionKey; label: string; desc: string }[] = [
  { key: 'boards:view', label: 'Просмотр досок', desc: 'Доступ к списку и содержимому досок' },
  { key: 'boards:add', label: 'Создание досок', desc: 'Создавать новые доски' },
  { key: 'boards:edit', label: 'Редактирование досок', desc: 'Менять название и настройки досок' },
  { key: 'boards:delete', label: 'Удаление досок', desc: 'Удалять доски' },
  { key: 'columns:view', label: 'Просмотр колонок', desc: 'Видеть колонки и их статус' },
  { key: 'columns:add', label: 'Создание колонок', desc: 'Добавлять колонки' },
  { key: 'columns:edit', label: 'Редактирование колонок', desc: 'Менять названия и иконки' },
  { key: 'columns:delete', label: 'Удаление колонок', desc: 'Удалять колонки' },
  { key: 'cards:view', label: 'Просмотр карточек', desc: 'Видеть задачи и их детали' },
  { key: 'cards:add', label: 'Создание карточек', desc: 'Добавлять новые задачи' },
  { key: 'cards:edit', label: 'Редактирование карточек', desc: 'Менять содержание задач' },
  { key: 'cards:delete', label: 'Удаление карточек', desc: 'Удалять задачи' },
]

const rolePresets: Record<UserRole, PermissionKey[]> = {
  admin: permissionCatalog.map((item) => item.key),
  manager: [
    'boards:view',
    'boards:add',
    'boards:edit',
    'columns:view',
    'columns:add',
    'columns:edit',
    'cards:view',
    'cards:add',
    'cards:edit',
    'cards:delete',
  ],
  editor: [
    'boards:view',
    'columns:view',
    'columns:add',
    'columns:edit',
    'cards:view',
    'cards:add',
    'cards:edit',
  ],
  viewer: ['boards:view', 'columns:view', 'cards:view'],
}

function loadAuthUser(): AuthUser | null {
  const raw = localStorage.getItem(AUTH_USER_KEY)
  if (!raw) return null
  try {
    return JSON.parse(raw) as AuthUser
  } catch {
    return null
  }
}

function storeAuth(user: AuthUser) {
  localStorage.setItem(AUTH_TOKEN_KEY, user.token)
  localStorage.setItem(AUTH_USER_KEY, JSON.stringify(user))
}

async function registerOneSignalPlayerId() {
  try {
    const playerId = OneSignal.User?.PushSubscription?.id
    if (playerId) {
      await api.updateNotificationProfile({ onesignal_player_id: playerId } as Record<string, string>)
    }
  } catch {
    // non-critical
  }
}

function clearAuth() {
  localStorage.removeItem(AUTH_TOKEN_KEY)
  localStorage.removeItem(AUTH_USER_KEY)
}

function useAuthState() {
  const [user, setUser] = useState<AuthUser | null>(() => loadAuthUser())
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(AUTH_TOKEN_KEY))

  const login = (next: AuthUser) => {
    storeAuth(next)
    setUser(next)
    setToken(next.token)
    try { OneSignal.Slidedown.promptPush() } catch { /* not critical */ }
    void registerOneSignalPlayerId()
  }

  const logout = () => {
    clearAuth()
    setUser(null)
    setToken(null)
  }

  return { user, token, login, logout }
}

function persistTheme(isDark: boolean) {
  try {
    localStorage.setItem(THEME_KEY, isDark ? 'dark' : 'light')
  } catch {
    // ignore
  }
}

function toggleTheme() {
  const nextIsDark = !document.documentElement.classList.contains('dark')
  document.documentElement.classList.toggle('dark', nextIsDark)
  persistTheme(nextIsDark)
}

function useBoards() {
  const [boards, setBoards] = useState<Board[]>([])
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    api.listBoards().then(setBoards).finally(() => setLoading(false))
  }, [])
  return { boards, setBoards, loading }
}

function BoardsPage({ user, onLogout }: { user: AuthUser; onLogout: () => void }) {
  const { boards, setBoards, loading } = useBoards()
  const [name, setName] = useState('')
  const onCreate = async () => {
    if (!name.trim()) return
    const b = await api.createBoard(name.trim())
    setBoards((prev) => [...prev, b])
    setName('')
  }
  if (loading) return <div className="p-6 text-slate-600 dark:text-slate-300">Loading…</div>
  return (
    <div className="min-h-screen bg-slate-50 px-4 py-10 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <div className="mx-auto w-full max-w-5xl space-y-8">
        <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-1">
            <p className="text-sm font-semibold uppercase tracking-widest text-sky-600 dark:text-sky-400">
              Task Manager
            </p>
            <h1 className="text-3xl font-semibold">Доски</h1>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Создавайте доски и управляйте задачами в одном месте.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-3 py-1 text-xs font-medium text-slate-500 dark:border-slate-800 dark:text-slate-400">
              <span className="h-2 w-2 rounded-full bg-emerald-500" aria-hidden="true" />
              API online
            </span>
            <Link
              to="/settings"
              className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-3 py-1 text-xs font-medium text-slate-500 transition hover:border-slate-300 hover:text-slate-700 dark:border-slate-800 dark:text-slate-300"
            >
              {user.full_name || user.username}
            </Link>
            <button
              onClick={onLogout}
              className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-3 py-1 text-xs font-medium text-slate-500 transition hover:border-rose-300 hover:text-rose-600 dark:border-slate-800 dark:text-slate-300"
            >
              Выйти
            </button>
          </div>
        </header>

        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <label className="flex-1">
              <span className="sr-only">Название новой доски</span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Название новой доски"
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm text-slate-900 placeholder:text-slate-400 shadow-inner dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              />
            </label>
            <button
              onClick={onCreate}
              className="inline-flex items-center justify-center rounded-xl bg-sky-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-sky-500"
              aria-label="Создать доску"
            >
              Создать
            </button>
          </div>
        </section>

        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {boards.map((b) => (
            <Link
              key={b.id}
              to={`/boards/${b.id}`}
              className="group rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-sky-400 hover:shadow-md dark:border-slate-800 dark:bg-slate-900"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900 group-hover:text-sky-600 dark:text-slate-100">
                    {b.name}
                  </h2>
                  <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
                    Перейти к задачам и статусам.
                  </p>
                </div>
                <span className="rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-500 dark:bg-slate-800 dark:text-slate-300">
                  #{b.id}
                </span>
              </div>
            </Link>
          ))}
        </section>
      </div>
    </div>
  )
}

function BoardPage({ onLogout, user }: { onLogout: () => void; user: AuthUser }) {
  const { id } = useParams()
  const boardId = Number(id)
  const [columns, setColumns] = useState<Column[]>([])
  const [cards, setCards] = useState<Card[]>([])
  const [boardName, setBoardName] = useState('')
  const [colName, setColName] = useState('')
  const [colIcon, setColIcon] = useState('📋')
  const [isCreatingColumn, setIsCreatingColumn] = useState(false)
  const [newCardTitle, setNewCardTitle] = useState<Record<number, string>>({})
  const [dragged, setDragged] = useState<Card | null>(null)
  const [activeTag, setActiveTag] = useState('Все')
  const [activeCategory, setActiveCategory] = useState('Все')
  const [selectedCard, setSelectedCard] = useState<Card | null>(null)

  type CardDraft = {
    title: string
    description: string
    assignee: number | null
    deadline: string
    priority: '🔥' | '🟡' | '🟢'
    tags: string[]
    categories: string[]
    checklist: { id: string; text: string; done: boolean }[]
    attachments: {
      id: string
      name: string
      type: 'file' | 'link' | 'photo'
      url?: string
      mimeType?: string
      size?: number
      createdAt?: string
    }[]
  }

  const [draft, setDraft] = useState<CardDraft | null>(null)
  const draftBaseRef = useRef<CardDraft | null>(null)
  const [pendingUploadFiles, setPendingUploadFiles] = useState<File[]>([])
  const [pendingDeleteAttachmentIds, setPendingDeleteAttachmentIds] = useState<string[]>([])

  const [saveBusy, setSaveBusy] = useState(false)
  const saveBusyRef = useRef(false)
  const [deleteBusy, setDeleteBusy] = useState(false)
  const [modalError, setModalError] = useState('')

  const [toast, setToast] = useState<
    | null
    | {
        tone: 'error' | 'info'
        message: string
        retry?:
          | { type: 'updated'; cardId: number; version: number }
          | { type: 'deleted'; card_id: number; version: number; board?: number; column?: number; card_title?: string }
      }
  >(null)
  const [assignees, setAssignees] = useState<{ id: number; name: string }[]>([])
  const [cardTags, setCardTags] = useState<Record<number, string[]>>({})
  const [cardCategories, setCardCategories] = useState<Record<number, string[]>>({})
  const [cardChecklist, setCardChecklist] = useState<Record<number, { id: string; text: string; done: boolean }[]>>({})
  const [cardAttachments, setCardAttachments] = useState<
    Record<
      number,
      {
        id: string
        name: string
        type: 'file' | 'link' | 'photo'
        url?: string
        mimeType?: string
        size?: number
        createdAt?: string
      }[]
    >
  >({})
  const [cardAssignees, setCardAssignees] = useState<Record<number, number | undefined>>({})
  const [cardDeadlines, setCardDeadlines] = useState<Record<number, string>>({})
  const [cardPriorities, setCardPriorities] = useState<Record<number, '🔥' | '🟡' | '🟢'>>({})
  const [newTag, setNewTag] = useState('')
  const [newCategory, setNewCategory] = useState('')
  const [newChecklistItem, setNewChecklistItem] = useState('')
  const [newAttachmentName, setNewAttachmentName] = useState('')
  const [newAttachmentType, setNewAttachmentType] = useState<'file' | 'link' | 'photo'>('file')
  const [newAttachmentUrl, setNewAttachmentUrl] = useState('')
  const [newAttachmentFiles, setNewAttachmentFiles] = useState<File[]>([])
  const [attachmentFileInputKey, setAttachmentFileInputKey] = useState(0)
  const attachmentFileInputRef = useRef<HTMLInputElement | null>(null)
  const deadlineSaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [reminderData, setReminderData] = useState<CardDeadlineReminderResponse | null>(null)
  const [reminderDrafts, setReminderDrafts] = useState<CardDeadlineReminder[]>([])
  const [reminderLoading, setReminderLoading] = useState(false)
  const [reminderSaving, setReminderSaving] = useState(false)
  const [reminderError, setReminderError] = useState('')
  const [reminderFieldError, setReminderFieldError] = useState('')
  const [newReminderValue, setNewReminderValue] = useState(10)
  const [newReminderUnit, setNewReminderUnit] = useState<'minutes' | 'hours'>('minutes')

  // ---- datetime helpers ----
  // Backend stores datetimes as ISO strings. The card modal uses <input type="datetime-local" />.
  // We normalize UI state to the datetime-local format: YYYY-MM-DDTHH:mm (local time).
  const isoToDatetimeLocal = (value: string) => {
    const parsed = new Date(value)
    if (Number.isNaN(parsed.getTime())) return ''
    const pad = (n: number) => String(n).padStart(2, '0')
    const yyyy = parsed.getFullYear()
    const mm = pad(parsed.getMonth() + 1)
    const dd = pad(parsed.getDate())
    const hh = pad(parsed.getHours())
    const min = pad(parsed.getMinutes())
    return `${yyyy}-${mm}-${dd}T${hh}:${min}`
  }

  const datetimeLocalToIso = (value: string) => {
    if (!value) return null
    const parsed = new Date(value)
    if (Number.isNaN(parsed.getTime())) return null
    return parsed.toISOString()
  }

  useEffect(() => {
    api.listColumns(boardId).then(setColumns)
    api.listCardsByBoard(boardId).then((loaded) => {
      setCards(loaded)
      setCardTags(() => {
        const next: Record<number, string[]> = {}
        for (const card of loaded) next[card.id] = card.tags ?? []
        return next
      })
      setCardCategories(() => {
        const next: Record<number, string[]> = {}
        for (const card of loaded) next[card.id] = card.categories ?? []
        return next
      })
      setCardChecklist(() => {
        const next: Record<number, { id: string; text: string; done: boolean }[]> = {}
        for (const card of loaded) next[card.id] = card.checklist ?? []
        return next
      })
      setCardAttachments(() => {
        const next: Record<
          number,
          {
            id: string
            name: string
            type: 'file' | 'link' | 'photo'
            url?: string
            mimeType?: string
            size?: number
            createdAt?: string
          }[]
        > = {}
        for (const card of loaded) next[card.id] = card.attachments ?? []
        return next
      })
      setCardAssignees(() => {
        const next: Record<number, number | undefined> = {}
        for (const card of loaded) {
          if (card.assignee != null) next[card.id] = card.assignee
        }
        return next
      })
      setCardPriorities(() => {
        const next: Record<number, '🔥' | '🟡' | '🟢'> = {}
        for (const card of loaded) {
          const marker = (card.priority as '🔥' | '🟡' | '🟢' | undefined) ?? '🟡'
          next[card.id] = marker
        }
        return next
      })
      setCardDeadlines((prev) => {
        const next = { ...prev }
        for (const card of loaded) {
          if (card.deadline) next[card.id] = isoToDatetimeLocal(card.deadline)
        }
        return next
      })
    })
    api.listBoards().then((boards) => {
      const current = boards.find((b) => b.id === boardId)
      setBoardName(current?.name ?? '')
    })
  }, [boardId])

  useEffect(() => {
    if (user?.is_admin) {
      api
        .listUsers()
        .then((users) => {
          setAssignees(users.map((item) => ({ id: item.id, name: item.full_name || item.username })))
        })
        .catch(() => setAssignees([]))
    } else if (user) {
      setAssignees([{ id: user.id, name: user.full_name || user.username }])
    }
  }, [user])

  // ---- Real-time WebSocket updates ----
  const wsToken = localStorage.getItem(AUTH_TOKEN_KEY)
  useBoardWebSocket({
    boardId,
    token: wsToken,
    onEvent: (event: BoardEvent) => {
      if (event.type === 'card.created') {
        setCards((prev) => {
          if (prev.some((c) => c.id === event.card.id)) return prev
          return [...prev, event.card]
        })
      } else if (event.type === 'card.updated' || event.type === 'card.moved') {
        setCards((prev) => prev.map((c) => (c.id === event.card.id ? event.card : c)))
        setSelectedCard((prev) => (prev?.id === event.card.id ? event.card : prev))
      } else if (event.type === 'card.deleted') {
        setCards((prev) => prev.filter((c) => c.id !== event.card_id))
        setSelectedCard((prev) => (prev?.id === event.card_id ? null : prev))
      } else if (event.type === 'column.created') {
        setColumns((prev) => {
          if (prev.some((col) => col.id === event.column.id)) return prev
          return [...prev, event.column]
        })
      } else if (event.type === 'column.updated') {
        setColumns((prev) => prev.map((col) => (col.id === event.column.id ? event.column : col)))
      } else if (event.type === 'column.deleted') {
        setColumns((prev) => prev.filter((col) => col.id !== event.column_id))
      } else if (event.type === 'board.updated') {
        setBoardName(event.board.name)
      }
    },
  })

  useEffect(() => {
    setNewTag('')
    setNewCategory('')
    setNewChecklistItem('')
    setNewAttachmentName('')
    setNewAttachmentUrl('')
    setNewAttachmentType('file')
    setNewAttachmentFiles([])
    setAttachmentFileInputKey((k) => k + 1)
    setPendingUploadFiles([])
    setPendingDeleteAttachmentIds([])
    setModalError('')
    setSaveBusy(false)
    saveBusyRef.current = false
    setDeleteBusy(false)
    setReminderData(null)
    setReminderDrafts([])
    setReminderLoading(false)
    setReminderSaving(false)
    setReminderError('')
    setReminderFieldError('')
    if (!selectedCard) {
      setDraft(null)
      draftBaseRef.current = null
      return
    }

    const id = selectedCard.id
    const base: CardDraft = {
      title: selectedCard.title || '',
      description: selectedCard.description || '',
      assignee: (cardAssignees[id] ?? selectedCard.assignee) ?? null,
      deadline: cardDeadlines[id] ?? (selectedCard.deadline ? isoToDatetimeLocal(selectedCard.deadline) : ''),
      priority: (cardPriorities[id] ?? selectedCard.priority ?? '🟡') as '🔥' | '🟡' | '🟢',
      tags: (cardTags[id] ?? selectedCard.tags ?? []) as string[],
      categories: (cardCategories[id] ?? selectedCard.categories ?? []) as string[],
      checklist: (cardChecklist[id] ?? selectedCard.checklist ?? []) as { id: string; text: string; done: boolean }[],
      attachments: (cardAttachments[id] ?? selectedCard.attachments ?? []) as {
        id: string
        name: string
        type: 'file' | 'link' | 'photo'
        url?: string
        mimeType?: string
        size?: number
        createdAt?: string
      }[],
    }
    setDraft(base)
    draftBaseRef.current = base
  }, [selectedCard?.id])

  const selectedCardId = selectedCard?.id ?? null
  const selectedCardIsPending = selectedCardId != null && selectedCardId < 0
  const selectedTags = draft?.tags ?? []
  const selectedCategories = draft?.categories ?? []
  const selectedChecklist = draft?.checklist ?? []
  const selectedAttachments = draft?.attachments ?? []
  const selectedPriority = draft?.priority ?? ''

  useEffect(() => {
    if (!selectedCardId || selectedCardIsPending) return
    setReminderLoading(true)
    setReminderError('')
    api
      .getCardDeadlineReminder(selectedCardId)
      .then((data) => {
        setReminderData(data)
        setReminderDrafts(data.reminders ?? [])
      })
      .catch((e) => setReminderError((e as Error).message))
      .finally(() => setReminderLoading(false))
  }, [selectedCardId, selectedCardIsPending])

  const applyCardUpdate = (updated: Card) => {
    setCards((prev) => prev.map((c) => (c.id === updated.id ? updated : c)))
    setSelectedCard((prev) => (prev?.id === updated.id ? updated : prev))
  }

  const persistSelectedCard = async (
    patch: Partial<{
      column: number
      title: string
      description: string
      assignee: number | null
      deadline: string | null
      priority: string
      tags: string[]
      categories: string[]
      checklist: { id: string; text: string; done: boolean }[]
      attachments: {
        id: string
        name: string
        type: 'file' | 'link' | 'photo'
        url?: string
        mimeType?: string
        size?: number
        createdAt?: string
      }[]
    }>
  ) => {
    if (!selectedCardId) return
    const updated = await api.updateCard(selectedCardId, patch)
    applyCardUpdate(updated)
    if (patch.tags) setCardTags((prev) => ({ ...prev, [updated.id]: updated.tags ?? [] }))
    if (patch.categories) setCardCategories((prev) => ({ ...prev, [updated.id]: updated.categories ?? [] }))
    if (patch.checklist) setCardChecklist((prev) => ({ ...prev, [updated.id]: updated.checklist ?? [] }))
    if (patch.attachments) setCardAttachments((prev) => ({ ...prev, [updated.id]: updated.attachments ?? [] }))
    if (patch.assignee !== undefined) {
      setCardAssignees((prev) => ({ ...prev, [updated.id]: updated.assignee ?? undefined }))
    }
    if (patch.deadline !== undefined) {
      setCardDeadlines((prev) => ({ ...prev, [updated.id]: updated.deadline ? isoToDatetimeLocal(updated.deadline) : '' }))
    }
    if (patch.priority) {
      setCardPriorities((prev) => ({ ...prev, [updated.id]: updated.priority ?? '🟡' }))
    }
    return updated
  }

  const formatReminder = (reminder: CardDeadlineReminder) => {
    if (reminder.offset_unit === 'hours') {
      const unit = reminder.offset_value === 1 ? 'час' : reminder.offset_value < 5 ? 'часа' : 'часов'
      return `за ${reminder.offset_value} ${unit}`
    }
    const unit = reminder.offset_value === 1 ? 'минуту' : reminder.offset_value < 5 ? 'минуты' : 'минут'
    return `за ${reminder.offset_value} ${unit}`
  }

  const buildCardUpdateChanges = (base: CardDraft, next: CardDraft) => {
    const sameJson = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)
    const changes: string[] = []
    const changesMeta: Record<string, unknown> = {}

    const nextTitle = next.title.trim()
    if (nextTitle && nextTitle !== base.title) {
      changes.push(`Заголовок: “${nextTitle}”`)
      changesMeta.title = nextTitle
    }

    const nextDescription = next.description.trim()
    if (nextDescription !== base.description.trim()) {
      if (nextDescription) {
        changes.push(`Описание: ${nextDescription}`)
        changesMeta.description = nextDescription
      } else {
        changes.push('Описание удалено')
        changesMeta.description = ''
      }
    }

    if (next.assignee !== base.assignee) {
      if (next.assignee != null) {
        const assigneeName = assignees.find((item) => item.id === next.assignee)?.name
        changes.push(`Исполнитель: ${assigneeName || `#${next.assignee}`}`)
        changesMeta.assignee = assigneeName || next.assignee
      } else {
        changes.push('Исполнитель удален')
        changesMeta.assignee = null
      }
    }

    if (next.deadline !== base.deadline) {
      if (next.deadline) {
        changes.push(`Срок: ${formatDateTime(next.deadline)}`)
        changesMeta.deadline = next.deadline
      } else {
        changes.push('Срок удален')
        changesMeta.deadline = null
      }
    }

    if (next.priority !== base.priority) {
      changes.push(`Приоритет: ${next.priority}`)
      changesMeta.priority = next.priority
    }

    if (!sameJson(next.tags, base.tags)) {
      if (next.tags.length > 0) {
        changes.push(`Теги: ${next.tags.join(', ')}`)
        changesMeta.tags = next.tags
      } else {
        changes.push('Теги удалены')
        changesMeta.tags = []
      }
    }

    if (!sameJson(next.categories, base.categories)) {
      if (next.categories.length > 0) {
        changes.push(`Категории: ${next.categories.join(', ')}`)
        changesMeta.categories = next.categories
      } else {
        changes.push('Категории удалены')
        changesMeta.categories = []
      }
    }

    if (!sameJson(next.checklist, base.checklist)) {
      const baseMap = new Map(base.checklist.map((item) => [item.id, item]))
      const nextMap = new Map(next.checklist.map((item) => [item.id, item]))
      const added = next.checklist.filter((item) => !baseMap.has(item.id))
      const removed = base.checklist.filter((item) => !nextMap.has(item.id))
      if (added.length > 0) {
        changes.push(`Чек-лист добавлено: ${added.map((item) => item.text).join(', ')}`)
        changesMeta.checklist_added = added
      }
      if (removed.length > 0) {
        changes.push(`Чек-лист удалено: ${removed.map((item) => item.text).join(', ')}`)
        changesMeta.checklist_removed = removed
      }
      if (added.length === 0 && removed.length === 0) {
        changes.push('Чек-лист обновлен')
        changesMeta.checklist_updated = true
      }
    }

    if (!sameJson(next.attachments, base.attachments)) {
      if (next.attachments.length > 0) {
        changes.push(`Вложения: ${next.attachments.length}`)
        changesMeta.attachments = next.attachments
      } else {
        changes.push('Вложения удалены')
        changesMeta.attachments = []
      }
    }

    return { changes, changesMeta }
  }

  const scheduleDeadlineSave = () => {
    if (deadlineSaveTimeoutRef.current) {
      clearTimeout(deadlineSaveTimeoutRef.current)
      deadlineSaveTimeoutRef.current = null
    }
  }

  const deleteSelectedCard = async () => {
    const cardId = selectedCard?.id
    if (!cardId) return
    if (deleteBusy || saveBusy) return
    const title = selectedCard?.title || 'задачу'
    if (!window.confirm(`Удалить ${title}?`)) return

    const meta = {
      card_id: cardId,
      version: selectedCard?.version ?? 0,
      board: selectedCard?.board,
      column: selectedCard?.column,
      card_title: selectedCard?.title,
    }

    setDeleteBusy(true)
    setModalError('')
    try {
      await api.deleteCard(cardId)
      setCards((prev) => prev.filter((c) => c.id !== cardId))
      setSelectedCard(null)

      setCardTags((prev) => {
        const next = { ...prev }
        delete next[cardId]
        return next
      })
      setCardCategories((prev) => {
        const next = { ...prev }
        delete next[cardId]
        return next
      })
      setCardChecklist((prev) => {
        const next = { ...prev }
        delete next[cardId]
        return next
      })
      setCardAttachments((prev) => {
        const next = { ...prev }
        delete next[cardId]
        return next
      })
      setCardAssignees((prev) => {
        const next = { ...prev }
        delete next[cardId]
        return next
      })
      setCardDeadlines((prev) => {
        const next = { ...prev }
        delete next[cardId]
        return next
      })
      setCardPriorities((prev) => {
        const next = { ...prev }
        delete next[cardId]
        return next
      })

      try {
        await api.notifyCardDeleted(meta)
      } catch {
        setToast({
          tone: 'error',
          message: 'Задача удалена, но уведомление отправить не удалось.',
          retry: { type: 'deleted', ...meta },
        })
      }
    } catch (e) {
      setModalError((e as Error).message)
    } finally {
      setDeleteBusy(false)
    }
  }

  useEffect(() => {
    return () => {
      if (deadlineSaveTimeoutRef.current) {
        clearTimeout(deadlineSaveTimeoutRef.current)
      }
    }
  }, [])

  const onSaveCard = async () => {
    if (!selectedCardId || !selectedCard || !draft || !draftBaseRef.current) return
    if (saveBusyRef.current) return
    saveBusyRef.current = true
    setSaveBusy(true)
    setModalError('')

    if (deadlineSaveTimeoutRef.current) {
      clearTimeout(deadlineSaveTimeoutRef.current)
      deadlineSaveTimeoutRef.current = null
    }

    const base = draftBaseRef.current

    const sameJson = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)
    const patch: Partial<{
      title: string
      description: string
      assignee: number | null
      deadline: string | null
      priority: string
      tags: string[]
      categories: string[]
      checklist: { id: string; text: string; done: boolean }[]
      attachments: {
        id: string
        name: string
        type: 'file' | 'link' | 'photo'
        url?: string
        mimeType?: string
        size?: number
        createdAt?: string
      }[]
    }> = {}

    const nextTitle = draft.title.trim()
    if (!nextTitle) {
      setModalError('Заголовок не может быть пустым')
      setSaveBusy(false)
      saveBusyRef.current = false
      return
    }

    if (nextTitle !== base.title) patch.title = nextTitle
    if (draft.description !== base.description) patch.description = draft.description
    if (draft.assignee !== base.assignee) patch.assignee = draft.assignee
    if (draft.deadline !== base.deadline) patch.deadline = draft.deadline ? datetimeLocalToIso(draft.deadline) : null
    if (draft.priority !== base.priority) patch.priority = draft.priority
    if (!sameJson(draft.tags, base.tags)) patch.tags = draft.tags
    if (!sameJson(draft.categories, base.categories)) patch.categories = draft.categories
    if (!sameJson(draft.checklist, base.checklist)) patch.checklist = draft.checklist
    if (!sameJson(draft.attachments, base.attachments)) patch.attachments = draft.attachments

    const hasPatch = Object.keys(patch).length > 0
    const hasAttachmentOps = pendingUploadFiles.length > 0 || pendingDeleteAttachmentIds.length > 0

    const reminderChanged = reminderData
      ? JSON.stringify(reminderDrafts) !== JSON.stringify(reminderData.reminders)
      : reminderDrafts.length > 0

    if (!hasPatch && !hasAttachmentOps && !reminderChanged) {
      setSelectedCard(null)
      setSaveBusy(false)
      saveBusyRef.current = false
      return
    }

    try {
      let updated: Card | undefined

      if (hasPatch) {
        updated = await persistSelectedCard(patch)
      }

      if (reminderChanged) {
        const reminderOk = await saveReminder()
        if (!reminderOk) {
          setSaveBusy(false)
          saveBusyRef.current = false
          return
        }
      }

      if (pendingUploadFiles.length > 0) {
        const uploaded = await api.uploadCardAttachments(selectedCardId, pendingUploadFiles)
        updated = uploaded
        applyCardUpdate(uploaded)
        setCardAttachments((prev) => ({ ...prev, [uploaded.id]: uploaded.attachments ?? [] }))
        setPendingUploadFiles([])
      }

      for (const attachmentId of pendingDeleteAttachmentIds) {
        const deleted = await api.deleteCardAttachment(selectedCardId, attachmentId)
        updated = deleted
        applyCardUpdate(deleted)
        setCardAttachments((prev) => ({ ...prev, [deleted.id]: deleted.attachments ?? [] }))
      }
      setPendingDeleteAttachmentIds([])

      const finalCard = updated ?? selectedCard
      // Close modal BEFORE notifying (strict order).
      setSelectedCard(null)

      try {
        const { changes, changesMeta } = buildCardUpdateChanges(base, {
          ...draft,
          title: draft.title.trim(),
          description: draft.description,
          deadline: draft.deadline,
          tags: draft.tags,
          categories: draft.categories,
          checklist: draft.checklist,
          attachments: draft.attachments,
        })

        if (reminderChanged) {
          const enabled = reminderDrafts.filter((item) => item.enabled)
          if (enabled.length > 0) {
            const reminderTexts = enabled.map((item) => formatReminder(item))
            changes.push(`Напоминания: ${reminderTexts.join(', ')}`)
            changesMeta.reminders = reminderTexts
          } else {
            changes.push('Напоминания отключены')
            changesMeta.reminders = []
          }
        }

        await api.notifyCardUpdated(finalCard.id, {
          version: finalCard.version,
          description: draft.description.trim() || undefined,
          changes,
          changes_meta: changesMeta,
        })
      } catch {
        setToast({
          tone: 'error',
          message: 'Изменения сохранены, но уведомление отправить не удалось.',
          retry: { type: 'updated', cardId: finalCard.id, version: finalCard.version },
        })
      }
    } catch (e) {
      setModalError((e as Error).message)
    } finally {
      setSaveBusy(false)
      saveBusyRef.current = false
    }
  }

  const saveReminder = async () => {
    if (!selectedCardId) return false
    if (reminderSaving) return false
    setReminderSaving(true)
    setReminderError('')
    setReminderFieldError('')
    try {
      const availableCount = reminderData?.channels
        ? Object.values(reminderData.channels).filter((c) => c.available).length
        : 0
      const invalidChannel = reminderDrafts.some((item) => item.enabled && !item.channel && availableCount !== 1)
      if (invalidChannel) {
        setReminderFieldError('Выберите доступный канал доставки')
        setReminderSaving(false)
        return false
      }
      const updated = await api.saveCardDeadlineReminder(selectedCardId, {
        reminders: reminderDrafts.map((item) => ({
          enabled: item.enabled,
          offset_value: item.offset_value,
          offset_unit: item.offset_unit,
          channel: item.channel,
        })),
      })
      setReminderData((prev) => (prev ? { ...prev, reminders: updated } : prev))
      setReminderDrafts(updated)
      return true
    } catch (e) {
      setReminderError((e as Error).message)
      return false
    } finally {
      setReminderSaving(false)
    }
  }

  const applyReminderValue = (id: number, value: number) => {
    setReminderDrafts((prev) => prev.map((item) => (item.id === id ? { ...item, offset_value: value } : item)))
  }

  const applyReminderUnit = (id: number, unit: 'minutes' | 'hours') => {
    setReminderDrafts((prev) => prev.map((item) => (item.id === id ? { ...item, offset_unit: unit } : item)))
  }

  const applyReminderChannel = (channel: 'email' | 'telegram' | null) => {
    setReminderDrafts((prev) => prev.map((item) => ({ ...item, channel })))
  }

  const toggleReminder = (id: number, enabled: boolean) => {
    setReminderDrafts((prev) => prev.map((item) => (item.id === id ? { ...item, enabled } : item)))
  }

  const addReminderInterval = (value: number, unit: 'minutes' | 'hours') => {
    const nextId = Math.max(0, ...reminderDrafts.map((item) => item.id)) + 1
    setReminderDrafts((prev) => [
      ...prev,
      {
        id: nextId,
        order: prev.length + 1,
        enabled: true,
        offset_value: value,
        offset_unit: unit,
        channel: prev[0]?.channel ?? null,
        scheduled_at: null,
        status: 'disabled',
        last_error: '',
        sent_at: null,
      },
    ])
  }

  const removeReminderInterval = (id: number) => {
    setReminderDrafts((prev) => prev.filter((item) => item.id !== id))
  }

  const [toastSending, setToastSending] = useState(false)

  const retryToast = async () => {
    if (!toast?.retry || toastSending) return
    setToastSending(true)
    try {
      if (toast.retry.type === 'updated') {
        await api.notifyCardUpdated(toast.retry.cardId, { version: toast.retry.version })
      } else {
        await api.notifyCardDeleted(toast.retry)
      }
      setToast(null)
    } catch {
      // keep toast as-is
    } finally {
      setToastSending(false)
    }
  }

  const onCreateColumn = async () => {
    if (!colName.trim()) return
    const c = await api.createColumn(boardId, colName.trim(), colIcon)
    setColumns((prev) => [...prev, c])
    setColName('')
    setIsCreatingColumn(false)
  }

  const onCreateCard = async (columnId: number) => {
    const title = (newCardTitle[columnId] || '').trim()
    if (!title) return

    const tempId = -Date.now()
    const placeholder: Card = {
      id: tempId,
      board: boardId,
      column: columnId,
      assignee: null,
      title,
      description: '',
      deadline: null,
      priority: '🟡',
      tags: [],
      categories: [],
      checklist: [],
      attachments: [],
      position: '999999',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      version: 1,
    }
    setCards((prev) => [...prev, placeholder])
    setSelectedCard(placeholder)
    setNewCardTitle((s) => ({ ...s, [columnId]: '' }))

    try {
      const card = await api.createCard(columnId, title)
      setCards((prev) => {
        const withoutTemp = prev.filter((c) => c.id !== tempId)
        if (withoutTemp.some((c) => c.id === card.id)) return withoutTemp
        return [...withoutTemp, card]
      })
      setSelectedCard((prev) => (prev?.id === tempId ? card : prev))
    } catch {
      setCards((prev) => prev.filter((c) => c.id !== tempId))
    }
  }

  const move = async (card: Card, dir: 'up' | 'down' | 'left' | 'right') => {
    const originalCard = card
    if (dir === 'up' || dir === 'down') {
      const colCards = [...(grouped[card.column] || [])]
      const idx = colCards.findIndex((c) => c.id === card.id)
      if (idx < 0) return
      let before_id: number | undefined
      let after_id: number | undefined
      if (dir === 'up' && idx > 0) {
        const prev = colCards[idx - 1]
        if (prev) after_id = prev.id
      } else if (dir === 'down' && idx < colCards.length - 1) {
        const next = colCards[idx + 1]
        if (next) before_id = next.id
      }

      const swapIdx = dir === 'up' ? idx - 1 : idx + 1
      const swapCard = colCards[swapIdx]
      if (swapCard) {
        setCards((prev) => prev.map((c) => {
          if (c.id === card.id) return { ...c, position: swapCard.position }
          if (c.id === swapCard.id) return { ...c, position: card.position }
          return c
        }))
      }

      try {
        const updated = await api.moveCard(card.id, { before_id, after_id })
        setCards((prev) => prev.map((c) => (c.id === updated.id ? updated : c)))
      } catch {
        setCards((prev) => prev.map((c) => (c.id === originalCard.id ? originalCard : c)))
      }
    } else {
      // left/right change column
      const order = [...columns].sort((a, b) => (a.position > b.position ? 1 : -1))
      const curIdx = order.findIndex((c) => c.id === card.column)
      const target = dir === 'left' ? order[curIdx - 1] : order[curIdx + 1]
      if (!target) return

      setCards((prev) => prev.map((c) => (c.id === card.id ? { ...c, column: target.id } : c)))

      try {
        const updated = await api.moveCard(card.id, { to_column: target.id })
        setCards((prev) => prev.map((c) => (c.id === updated.id ? updated : c)))
      } catch {
        setCards((prev) => prev.map((c) => (c.id === originalCard.id ? originalCard : c)))
      }
    }
  }

  const stopCardOpen = (event: { preventDefault: () => void; stopPropagation: () => void }) => {
    event.preventDefault()
    event.stopPropagation()
  }

  const stopCardKeyBubble = (event: { stopPropagation: () => void }) => {
    event.stopPropagation()
  }

  const priorityFor = (card: Card) => {
    const marker = priorityMarkerFor(card)
    if (marker === '🔥') return { label: 'Срочно', marker: '🔥', tone: 'bg-rose-500/15 text-rose-600 dark:text-rose-300' }
    if (marker === '🟢') return { label: 'Можно когда будет время', marker: '🟢', tone: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-300' }
    return { label: 'Важно (до конца недели)', marker: '🟡', tone: 'bg-amber-500/15 text-amber-600 dark:text-amber-300' }
  }

  const formatDateTime = (value: string) => {
    if (!value) return ''
    const parsed = new Date(value)
    if (Number.isNaN(parsed.getTime())) return value
    return parsed.toLocaleString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const formatUpdatedStatus = (value: string) => {
    if (!value) return 'Обновлено недавно'
    const parsed = new Date(value)
    if (Number.isNaN(parsed.getTime())) return 'Обновлено недавно'
    const diffMs = Date.now() - parsed.getTime()
    if (diffMs < 60_000) return 'Обновлено недавно'
    return `Обновлено ${formatDateTime(value)}`
  }

  const tagOptions = ['Все', ...new Set(Object.values(cardTags).flat())]
  const categoryOptions = ['Все', ...new Set(Object.values(cardCategories).flat())]

  const tagsFor = (card: Card) => cardTags[card.id] ?? []
  const categoriesFor = (card: Card) => cardCategories[card.id] ?? []
  const deadlineFor = (card: Card) => cardDeadlines[card.id] ?? card.deadline ?? ''
  const priorityMarkerFor = (card: Card) => cardPriorities[card.id] ?? '🟡'

  const filteredCards = cards.filter((card) => {
    const tags = tagsFor(card)
    const categories = categoriesFor(card)
    const matchesTag = activeTag === 'Все' || tags.includes(activeTag)
    const matchesCategory = activeCategory === 'Все' || categories.includes(activeCategory)
    return matchesTag && matchesCategory
  })

  const grouped = useMemo(() => {
    const g: Record<number, Card[]> = {}
    for (const c of filteredCards) {
      g[c.column] = g[c.column] ?? []
      g[c.column]?.push(c)
    }
    for (const k of Object.keys(g)) {
      g[Number(k)]?.sort((a, b) => (a.position > b.position ? 1 : -1))
    }
    return g
  }, [filteredCards])

  const allKnownTags = tagOptions.filter((t) => t !== 'Все')
  const allKnownCategories = categoryOptions.filter((c) => c !== 'Все')

  const addTagValue = (valueRaw: string) => {
    if (!selectedCardId || !draft) return
    const value = valueRaw.trim()
    if (!value) return
    const next = Array.from(new Set([...(draft.tags ?? []), value]))
    setDraft((prev) => (prev ? { ...prev, tags: next } : prev))
  }

  const addCategoryValue = (valueRaw: string) => {
    if (!selectedCardId || !draft) return
    const value = valueRaw.trim()
    if (!value) return
    const next = Array.from(new Set([...(draft.categories ?? []), value]))
    setDraft((prev) => (prev ? { ...prev, categories: next } : prev))
  }

  const addTag = () => {
    if (!selectedCardId) return
    addTagValue(newTag)
    setNewTag('')
  }

  const removeTag = (tag: string) => {
    if (!selectedCardId || !draft) return
    const next = (draft.tags ?? []).filter((item) => item !== tag)
    setDraft((prev) => (prev ? { ...prev, tags: next } : prev))
  }

  const addCategory = () => {
    if (!selectedCardId) return
    addCategoryValue(newCategory)
    setNewCategory('')
  }

  const removeCategory = (category: string) => {
    if (!selectedCardId || !draft) return
    const next = (draft.categories ?? []).filter((item) => item !== category)
    setDraft((prev) => (prev ? { ...prev, categories: next } : prev))
  }

  const addChecklistItem = () => {
    if (!selectedCardId || !draft) return
    const value = newChecklistItem.trim()
    if (!value) return
    const item = { id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, text: value, done: false }
    const next = [...(draft.checklist ?? []), item]
    setDraft((prev) => (prev ? { ...prev, checklist: next } : prev))
    setNewChecklistItem('')
  }

  const toggleChecklistItem = (itemId: string) => {
    if (!selectedCardId || !draft) return
    const next = (draft.checklist ?? []).map((item) => (item.id === itemId ? { ...item, done: !item.done } : item))
    setDraft((prev) => (prev ? { ...prev, checklist: next } : prev))
  }

  const removeChecklistItem = (itemId: string) => {
    if (!selectedCardId || !draft) return
    const next = (draft.checklist ?? []).filter((item) => item.id !== itemId)
    setDraft((prev) => (prev ? { ...prev, checklist: next } : prev))
  }

  const addAttachment = async () => {
    if (!selectedCardId || !draft) return

    if (newAttachmentType === 'file') {
      if (newAttachmentFiles.length === 0) return
      setPendingUploadFiles((prev) => [...prev, ...newAttachmentFiles])
      setNewAttachmentFiles([])
      setAttachmentFileInputKey((k) => k + 1)
      return
    }

    const name = newAttachmentName.trim()
    if (!name) return
    const attachment = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      name,
      type: newAttachmentType,
      url: newAttachmentUrl.trim() || undefined,
    }
    const next = [...(draft.attachments ?? []), attachment]
    setDraft((prev) => (prev ? { ...prev, attachments: next } : prev))
    setNewAttachmentName('')
    setNewAttachmentUrl('')
  }

  const removeAttachment = async (item: { id: string; type: 'file' | 'link' | 'photo' }) => {
    if (!selectedCardId || !draft) return

    if (item.type === 'file') {
      setPendingDeleteAttachmentIds((prev) => (prev.includes(item.id) ? prev : [...prev, item.id]))
      setDraft((prev) => (prev ? { ...prev, attachments: (prev.attachments ?? []).filter((x) => x.id !== item.id) } : prev))
      return
    }

    setDraft((prev) => (prev ? { ...prev, attachments: (prev.attachments ?? []).filter((x) => x.id !== item.id) } : prev))
  }

  const handleDropOnColumn = async (columnId: number) => {
    if (!dragged || dragged.column === columnId) return
    const cardId = dragged.id

    // Optimistic update: move card to target column immediately
    setCards((prev) => prev.map((c) => (c.id === cardId ? { ...c, column: columnId } : c)))

    try {
      const updated = await api.moveCard(cardId, { to_column: columnId })
      setCards((prev) => prev.map((c) => (c.id === updated.id ? updated : c)))
    } catch {
      // Rollback on error
      setCards((prev) => prev.map((c) => (c.id === cardId ? { ...c, column: dragged.column } : c)))
    }
  }

  const sortedColumns = [...columns].sort((a, b) => (a.position > b.position ? 1 : -1))

  const availableIcons = ['📋', '📝', '⚡', '✅', '🧩', '🛠️', '🎯', '📦', '💡', '🔍']
  const accentClasses = [
    'text-sky-600 dark:text-sky-400',
    'text-amber-600 dark:text-amber-400',
    'text-emerald-600 dark:text-emerald-400',
    'text-rose-600 dark:text-rose-400',
    'text-indigo-600 dark:text-indigo-400',
    'text-teal-600 dark:text-teal-400',
  ]
  const accentForColumn = (index: number) => accentClasses[index % accentClasses.length]

  return (
    <div className="min-h-screen bg-slate-50 pb-12 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <header className="border-b border-slate-200 bg-white/80 px-4 py-6 backdrop-blur dark:border-slate-800 dark:bg-slate-950/80">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
              <Link to="/" className="hover:text-sky-600">Все доски</Link>
              <span aria-hidden="true">/</span>
              <span>{boardName}</span>
            </div>
            <h1 className="mt-2 text-2xl font-semibold">{boardName}</h1>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Перетаскивайте карточки между колонками и отслеживайте прогресс.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsCreatingColumn(true)}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200"
              aria-label="Создать колонку"
            >
              <span aria-hidden="true">＋</span>
              Новая колонка
            </button>
            <button
              onClick={onLogout}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-rose-300 hover:text-rose-600 dark:border-slate-700 dark:text-slate-200"
              aria-label="Выйти"
            >
              Выйти
            </button>
              <button
                type="button"
                onClick={toggleTheme}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200"
                aria-label="Переключить тему"
              >
              <span aria-hidden="true">🌓</span>
              Тема
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl space-y-6 px-4 pt-6">
        {isCreatingColumn ? (
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <label className="flex-1">
                <span className="sr-only">Название колонки</span>
                <input
                  value={colName}
                  onChange={(e) => setColName(e.target.value)}
                  placeholder="Введите название"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm text-slate-900 placeholder:text-slate-400 shadow-inner dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                />
              </label>
              <label className="flex items-center gap-2">
                <span className="text-xs font-semibold uppercase tracking-widest text-slate-500 dark:text-slate-400">
                  Иконка
                </span>
                <select
                  value={colIcon}
                  onChange={(e) => setColIcon(e.target.value)}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  aria-label="Выбор иконки колонки"
                >
                  {availableIcons.map((icon) => (
                    <option key={icon} value={icon}>
                      {icon}
                    </option>
                  ))}
                </select>
              </label>
              <div className="flex items-center gap-2">
                <button
                  onClick={onCreateColumn}
                  className="inline-flex items-center justify-center rounded-xl bg-sky-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-sky-500"
                  aria-label="Добавить колонку"
                >
                  Добавить
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsCreatingColumn(false)
                    setColName('')
                  }}
                  className="inline-flex items-center justify-center rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200"
                  aria-label="Отменить создание колонки"
                >
                  Отмена
                </button>
              </div>
            </div>
          </section>
        ) : null}

        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-lg font-semibold">Фильтры по тегам и категориям</h3>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                Быстро находите задачи по направлениям и типам работ.
              </p>
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400">
              Активно: {activeTag} / {activeCategory}
            </div>
          </div>
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-slate-500 dark:text-slate-400">Теги</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {tagOptions.map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => setActiveTag(tag)}
                    className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${
                      activeTag === tag
                        ? 'border-sky-400 bg-sky-500/10 text-sky-600 dark:text-sky-300'
                        : 'border-slate-200 text-slate-500 hover:border-slate-300 dark:border-slate-700 dark:text-slate-300'
                    }`}
                  >
                    {tag}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-slate-500 dark:text-slate-400">Категории</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {categoryOptions.map((category) => (
                  <button
                    key={category}
                    type="button"
                    onClick={() => setActiveCategory(category)}
                    className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${
                      activeCategory === category
                        ? 'border-emerald-400 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300'
                        : 'border-slate-200 text-slate-500 hover:border-slate-300 dark:border-slate-700 dark:text-slate-300'
                    }`}
                  >
                    {category}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section
          className="grid gap-5 lg:grid-cols-3"
          aria-label="Колонки канбан-доски"
        >
          {sortedColumns.map((col, index) => {
            const displayName = col.name?.trim() ? col.name : ''
            const displayIcon = col.icon?.trim() ? col.icon : ''
            const accent = accentForColumn(index)
            return (
              <div
                key={col.id}
                className="flex h-full flex-col rounded-2xl border border-slate-200 bg-white/80 p-4 shadow-sm backdrop-blur dark:border-slate-800 dark:bg-slate-900/80"
                onDragOver={(event) => event.preventDefault()}
                onDrop={() => handleDropOnColumn(col.id)}
                aria-label={`Колонка ${displayName || 'Без названия'}`}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      {displayIcon ? (
                        <span className="text-xl" aria-hidden="true">{displayIcon}</span>
                      ) : null}
                      <h2 className={`text-lg font-semibold ${accent}`}>{displayName}</h2>
                    </div>
                  </div>
                  <span className="rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-500 dark:bg-slate-800 dark:text-slate-300">
                    {(grouped[col.id] || []).length} задач
                  </span>
                </div>

                <div className="mt-4 flex items-center gap-2">
                  <label className="flex-1">
                    <span className="sr-only">Новая карточка</span>
                    <input
                      placeholder="Название задачи"
                      value={newCardTitle[col.id] || ''}
                      onChange={(e) => setNewCardTitle((s) => ({ ...s, [col.id]: e.target.value }))}
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 shadow-inner dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                    />
                  </label>
                  <button
                    onClick={() => onCreateCard(col.id)}
                    className="rounded-xl bg-slate-900 px-3 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
                    aria-label={`Добавить карточку в ${displayName || 'колонку'}`}
                  >
                    +
                  </button>
                </div>

                <ul className="mt-4 space-y-4" aria-label={`Карточки ${displayName || 'колонки'}`}>
                  {(grouped[col.id] || []).map((card) => {
                    const priority = priorityFor(card)
                    const tags = tagsFor(card)
                    const categories = categoriesFor(card)
                    const deadline = deadlineFor(card)
                    const assigneeId = cardAssignees[card.id] ?? card.assignee
                    const assigneeName = assigneeId != null ? (assignees.find((u) => u.id === assigneeId)?.name ?? null) : null
                    return (
                      <li
                        key={card.id}
                        className="group rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-sky-300 hover:shadow-md dark:border-slate-700 dark:bg-slate-950"
                        draggable
                        onDragStart={() => setDragged(card)}
                        onDragEnd={() => setDragged(null)}
                        onClick={() => setSelectedCard(card)}
                        aria-label={`Открыть задачу ${card.title}`}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault()
                            setSelectedCard(card)
                          }
                        }}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                              {card.title}
                            </h3>
                            <p className="mt-2 text-xs text-slate-600 dark:text-slate-400">
                              {card.description}
                            </p>
                          </div>
                          <span
                            className={`rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-wide ${priority.tone}`}
                          >
                            {priority.marker} {priority.label}
                          </span>
                        </div>

                        <div className="mt-3 flex flex-wrap gap-2">
                          {tags.map((tag) => (
                            <span
                              key={tag}
                              className="rounded-full border border-slate-200 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:border-slate-700 dark:text-slate-400"
                            >
                              {tag}
                            </span>
                          ))}
                          {categories.map((category) => (
                            <span
                              key={category}
                              className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-600 dark:bg-slate-800 dark:text-slate-300"
                            >
                              {category}
                            </span>
                          ))}
                        </div>

                        {deadline && (
                          <div className="mt-3 flex flex-wrap gap-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                            {deadline ? (
                              <span className="rounded-full border border-slate-200 px-2 py-1 dark:border-slate-700">
                                ⏰ {formatDateTime(deadline)}
                              </span>
                            ) : null}
                          </div>
                        )}

                        {assigneeName && (
                          <div className="mt-3 flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-sky-100 text-[10px] font-bold text-sky-700 dark:bg-sky-900 dark:text-sky-300">
                              {assigneeName[0]?.toUpperCase()}
                            </span>
                            <span>{assigneeName}</span>
                          </div>
                        )}

                        <div className="mt-3 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                          <span className="inline-flex items-center gap-1">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden="true" />
                            {formatUpdatedStatus(card.updated_at)}
                          </span>
                          <div className="flex items-center gap-1 md:hidden">
                            <button
                              type="button"
                              onClick={(event) => {
                                stopCardOpen(event)
                                void move(card, 'up')
                              }}
                              onKeyDown={(event) => {
                                if (event.key === 'Enter' || event.key === ' ') {
                                  stopCardKeyBubble(event)
                                }
                              }}
                              className="rounded-lg border border-slate-200 px-2 py-1 text-xs text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-900"
                              aria-label="Поднять карточку"
                            >
                              ↑
                            </button>
                            <button
                              type="button"
                              onClick={(event) => {
                                stopCardOpen(event)
                                void move(card, 'down')
                              }}
                              onKeyDown={(event) => {
                                if (event.key === 'Enter' || event.key === ' ') {
                                  stopCardKeyBubble(event)
                                }
                              }}
                              className="rounded-lg border border-slate-200 px-2 py-1 text-xs text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-900"
                              aria-label="Опустить карточку"
                            >
                              ↓
                            </button>
                            <button
                              type="button"
                              onClick={(event) => {
                                stopCardOpen(event)
                                void move(card, 'left')
                              }}
                              onKeyDown={(event) => {
                                if (event.key === 'Enter' || event.key === ' ') {
                                  stopCardKeyBubble(event)
                                }
                              }}
                              className="rounded-lg border border-slate-200 px-2 py-1 text-xs text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-900"
                              aria-label="Переместить влево"
                            >
                              ←
                            </button>
                            <button
                              type="button"
                              onClick={(event) => {
                                stopCardOpen(event)
                                void move(card, 'right')
                              }}
                              onKeyDown={(event) => {
                                if (event.key === 'Enter' || event.key === ' ') {
                                  stopCardKeyBubble(event)
                                }
                              }}
                              className="rounded-lg border border-slate-200 px-2 py-1 text-xs text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-900"
                              aria-label="Переместить вправо"
                            >
                              →
                            </button>
                          </div>
                        </div>
                      </li>
                    )
                  })}
                </ul>
              </div>
            )
          })}
        </section>
      </main>

      {selectedCard && draft ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4">
          <div className="w-full max-w-5xl rounded-2xl bg-white p-6 shadow-xl dark:bg-slate-950">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-slate-500 dark:text-slate-400">
                  Редактирование задачи
                </p>
                <h2 className="text-2xl font-semibold">{selectedCard.title}</h2>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => void onSaveCard()}
                  disabled={saveBusy || deleteBusy}
                  className={`inline-flex items-center justify-center rounded-xl bg-sky-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-sky-500 disabled:cursor-not-allowed disabled:opacity-60`}
                >
                  {saveBusy ? 'Сохранение…' : 'Сохранить'}
                </button>
                <button
                  type="button"
                  onClick={() => void deleteSelectedCard()}
                  disabled={saveBusy || deleteBusy}
                  className="inline-flex items-center justify-center rounded-xl border border-rose-200 px-3 py-2 text-sm font-semibold text-rose-700 shadow-sm transition hover:border-rose-300 hover:bg-rose-50 dark:border-rose-900/50 dark:text-rose-200 dark:hover:bg-rose-950"
                >
                  {deleteBusy ? 'Удаление…' : 'Удалить задачу'}
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedCard(null)}
                  disabled={saveBusy || deleteBusy}
                  className="inline-flex items-center justify-center rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200"
                >
                  Закрыть
                </button>
              </div>
            </div>

            {modalError ? <p className="mt-3 text-sm text-rose-600">{modalError}</p> : null}

            <div className="mt-6 grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
              <div className="space-y-5">
                <label className="block">
                  <span className="text-xs font-semibold uppercase tracking-widest text-slate-500 dark:text-slate-400">
                    Заголовок
                  </span>
                  <input
                    value={draft.title}
                    onChange={(event) => setDraft((prev) => (prev ? { ...prev, title: event.target.value } : prev))}
                    className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-semibold uppercase tracking-widest text-slate-500 dark:text-slate-400">
                    Подробное описание
                  </span>
                    <textarea
                      rows={4}
                      value={draft.description}
                      onChange={(event) => setDraft((prev) => (prev ? { ...prev, description: event.target.value } : prev))}
                      className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                    />
                </label>
                <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-700 dark:bg-slate-950">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-500 dark:text-slate-400">
                        Напоминание о дедлайне
                      </p>
                      <h3 className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                        {reminderDrafts.length > 0
                          ? `Напоминаний: ${reminderDrafts.filter((item) => item.enabled).length}`
                          : 'Напоминание отключено'}
                      </h3>
                    </div>
                    <div className="flex items-center gap-2">
                      <label className="inline-flex items-center gap-2 text-[11px] text-slate-600 dark:text-slate-300">
                        <input
                          type="checkbox"
                          checked={reminderDrafts.some((item) => item.enabled)}
                          onChange={(event) => {
                            const nextEnabled = event.target.checked
                            setReminderDrafts((prev) => prev.map((item) => ({ ...item, enabled: nextEnabled })))
                          }}
                          className="h-4 w-4 rounded border-slate-300 text-sky-600"
                          disabled={!(reminderData?.deadline || draft?.deadline) || reminderDrafts.length === 0}
                        />
                        Включено
                      </label>
                    </div>
                  </div>

                  {reminderLoading ? (
                    <p className="mt-2 text-[11px] text-slate-500 dark:text-slate-400">Загрузка настроек…</p>
                  ) : null}

                  {reminderError ? (
                    <p className="mt-2 text-[11px] text-rose-600">{reminderError}</p>
                  ) : null}

                  {!reminderData?.deadline && !draft?.deadline ? (
                    <div className="mt-2 rounded-lg border border-dashed border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-700 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-200">
                      Установите срок выполнения, чтобы настроить напоминание.
                    </div>
                  ) : null}

                  {reminderDrafts.length === 0 && (reminderData?.deadline || draft?.deadline) ? (
                    <div className="mt-2 rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-2 text-[11px] text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
                      Добавьте один или несколько интервалов напоминания.
                    </div>
                  ) : null}

                  {reminderDrafts.length > 0 && (reminderData?.deadline || draft?.deadline) ? (
                    <div className="mt-3 space-y-3">
                      <div className="space-y-2">
                        <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-500 dark:text-slate-400">
                          Интервалы до дедлайна
                        </span>
                        <div className="space-y-2">
                          {reminderDrafts.map((item) => (
                            <div key={item.id} className="flex flex-wrap items-center gap-2">
                              <input
                                type="number"
                                min={1}
                                max={item.offset_unit === 'hours' ? 168 : 1440}
                                step={1}
                                value={item.offset_value}
                                onChange={(event) => {
                                  const raw = event.target.value
                                  const next = Number(raw)
                                  if (!Number.isFinite(next) || !Number.isInteger(next)) {
                                    setReminderFieldError('Введите целое положительное число')
                                    return
                                  }
                                  if (next <= 0) {
                                    setReminderFieldError('Значение должно быть больше нуля')
                                    return
                                  }
                                  if (next > (item.offset_unit === 'hours' ? 168 : 1440)) {
                                    setReminderFieldError('Слишком большое значение')
                                    return
                                  }
                                  setReminderFieldError('')
                                  applyReminderValue(item.id, next)
                                }}
                                className="w-20 rounded-md border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                                disabled={!item.enabled}
                              />
                              <select
                                value={item.offset_unit}
                                onChange={(event) => {
                                  applyReminderUnit(item.id, event.target.value as 'minutes' | 'hours')
                                  setReminderFieldError('')
                                }}
                                className="rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                                disabled={!item.enabled}
                              >
                                <option value="minutes">минут</option>
                                <option value="hours">часов</option>
                              </select>
                              <label className="inline-flex items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400">
                                <input
                                  type="checkbox"
                                  checked={item.enabled}
                                  onChange={(event) => toggleReminder(item.id, event.target.checked)}
                                  className="h-3.5 w-3.5 rounded border-slate-300 text-sky-600"
                                />
                                Активно
                              </label>
                              <button
                                type="button"
                                onClick={() => removeReminderInterval(item.id)}
                                className="text-[11px] font-semibold text-rose-600 hover:text-rose-500"
                              >
                                Удалить
                              </button>
                            </div>
                          ))}
                        </div>
                          <div className="flex flex-wrap items-center gap-2">
                            <input
                              type="number"
                              min={1}
                              max={newReminderUnit === 'hours' ? 168 : 1440}
                              step={1}
                              value={newReminderValue}
                              onChange={(event) => setNewReminderValue(Number(event.target.value) || 1)}
                              className="w-20 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                            />
                            <select
                              value={newReminderUnit}
                              onChange={(event) => setNewReminderUnit(event.target.value as 'minutes' | 'hours')}
                              className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                            >
                              <option value="minutes">минут</option>
                              <option value="hours">часов</option>
                            </select>
                            <button
                              type="button"
                              onClick={() => addReminderInterval(newReminderValue, newReminderUnit)}
                              disabled={!(reminderData?.deadline || draft?.deadline)}
                              className="rounded-full border border-slate-200 px-2.5 py-0.5 text-[11px] font-semibold text-slate-600 transition hover:border-sky-300 hover:text-sky-700 disabled:opacity-60 dark:border-slate-700 dark:text-slate-300"
                            >
                              Добавить интервал
                            </button>
                          </div>
                        <div className="flex items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400">
                          Изменения сохраняются вместе с общей кнопкой “Сохранить”.
                        </div>
                      </div>

                      <div className="rounded-lg border border-slate-200 bg-slate-50 p-2 text-[11px] text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
                        <p className="font-semibold">Канал доставки</p>
                        <div className="mt-2 grid gap-2">
                          {(['email', 'telegram'] as const).map((channel) => {
                            const info = reminderData?.channels?.[channel]
                            const available = info?.available ?? false
                            const availableCount = reminderData?.channels
                              ? Object.values(reminderData.channels).filter((c) => c.available).length
                              : 0
                            const isOnlyAvailable = availableCount === 1
                            const isAuto = reminderDrafts.every((item) => item.channel === null) && isOnlyAvailable && available
                            return (
                              <label
                                key={channel}
                                className={`flex items-start gap-2 rounded-md border px-2.5 py-2 ${
                                  available
                                    ? 'border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-950'
                                    : 'border-rose-200 bg-rose-50 dark:border-rose-900/40 dark:bg-rose-950/40'
                                }`}
                              >
                                <input
                                  type="radio"
                                  name="reminder-channel"
                                  value={channel}
                                  checked={reminderDrafts.every((item) => item.channel === channel) || isAuto}
                                  onChange={() => applyReminderChannel(channel)}
                                  disabled={!available}
                                  className="mt-1 h-4 w-4 text-sky-600"
                                />
                                <div>
                                  <div className="flex items-center gap-2">
                                    <span className="font-semibold">
                                      {channel === 'email' ? 'Email' : 'Telegram'}
                                    </span>
                                    {isAuto ? (
                                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-200">
                                        единственный доступный
                                      </span>
                                    ) : null}
                                  </div>
                                  {!available ? (
                                    <p className="mt-1 text-[10px] text-rose-600">{info?.reason || 'Недоступен'}</p>
                                  ) : null}
                                </div>
                              </label>
                            )
                          })}
                        </div>
                        {reminderFieldError ? (
                          <p className="mt-2 text-[10px] text-rose-600">{reminderFieldError}</p>
                        ) : null}
                      </div>

                      {reminderDrafts.some((item) => item.status === 'invalid.past') ? (
                        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-700 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-200">
                          Время напоминания уже прошло. Скорректируйте интервал или срок выполнения.
                        </div>
                      ) : null}
                      {reminderDrafts.some((item) => item.status === 'invalid.channel') ? (
                        <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[11px] text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-200">
                          Канал доставки недоступен. Проверьте настройки уведомлений.
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-950">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <h3 className="text-sm font-semibold">Чек-лист</h3>
                    <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
                      <input
                        value={newChecklistItem}
                        onChange={(event) => setNewChecklistItem(event.target.value)}
                        placeholder="Добавить пункт"
                        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                      />
                      <button
                        type="button"
                        onClick={addChecklistItem}
                        className="rounded-lg bg-sky-600 px-3 py-2 text-xs font-semibold text-white"
                      >
                        Добавить
                      </button>
                    </div>
                  </div>
                  <div className="mt-3 space-y-2 text-sm text-slate-600 dark:text-slate-300">
                    {selectedChecklist.length === 0 ? (
                      <p className="text-xs text-slate-500 dark:text-slate-400">Пока нет пунктов чек-листа.</p>
                    ) : (
                      selectedChecklist.map((item) => (
                        <div key={item.id} className="flex items-center justify-between gap-3">
                          <label className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={item.done}
                              onChange={() => toggleChecklistItem(item.id)}
                              className="h-4 w-4 rounded border-slate-300 text-sky-600"
                            />
                        <span className={item.done ? 'line-through opacity-70' : ''}>{item.text}</span>
                          </label>
                          <button
                            type="button"
                            onClick={() => removeChecklistItem(item.id)}
                            className="text-xs font-semibold text-rose-600 hover:text-rose-500"
                          >
                            Удалить
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-950">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <h3 className="text-sm font-semibold">Вложения, ссылки, фото</h3>
                    <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
                      <select
                        value={newAttachmentType}
                        onChange={(event) => setNewAttachmentType(event.target.value as 'file' | 'link' | 'photo')}
                        className="rounded-lg border border-slate-200 bg-white px-2 py-2 text-xs text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                      >
                        <option value="file">Файл</option>
                        <option value="link">Ссылка</option>
                        <option value="photo">Фото</option>
                      </select>

                      {newAttachmentType === 'file' ? (
                        <>
                          <input
                            key={attachmentFileInputKey}
                            ref={attachmentFileInputRef}
                            type="file"
                            multiple
                            onChange={(event) => {
                              const list = event.target.files ? Array.from(event.target.files) : []
                              setNewAttachmentFiles(list)
                            }}
                            className="hidden"
                          />
                          <button
                            type="button"
                            onClick={() => attachmentFileInputRef.current?.click()}
                            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-left text-xs text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                          >
                            {newAttachmentFiles.length === 0
                              ? 'Файл не выбран'
                              : newAttachmentFiles.length === 1
                                ? newAttachmentFiles[0]?.name
                                : `Выбрано: ${newAttachmentFiles.length} файла(ов)`}
                          </button>
                        </>
                      ) : (
                        <>
                          <input
                            value={newAttachmentName}
                            onChange={(event) => setNewAttachmentName(event.target.value)}
                            placeholder="Название"
                            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                          />
                          <input
                            value={newAttachmentUrl}
                            onChange={(event) => setNewAttachmentUrl(event.target.value)}
                            placeholder="URL (необязательно)"
                            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                          />
                        </>
                      )}
                      <button
                        type="button"
                        onClick={addAttachment}
                        className="rounded-lg bg-sky-600 px-3 py-2 text-xs font-semibold text-white"
                      >
                        Добавить
                      </button>
                    </div>
                  </div>
                  <div className="mt-3 grid gap-2 text-xs text-slate-600 dark:text-slate-300">
                    {selectedAttachments.length === 0 ? (
                      <p className="text-xs text-slate-500 dark:text-slate-400">Вложения отсутствуют.</p>
                    ) : (
                      selectedAttachments.map((item) => (
                        <div key={item.id} className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2 dark:border-slate-800 dark:bg-slate-900">
                          <span className="inline-flex items-center gap-2">
                            {item.type === 'file' ? '📎' : item.type === 'photo' ? '🖼️' : '🔗'} {item.name}
                          </span>
                          <div className="flex items-center gap-2 text-xs">
                            {item.type === 'file' && item.url ? (
                              <a
                                href={item.url}
                                target="_blank"
                                rel="noreferrer"
                                className="font-semibold text-sky-600 hover:text-sky-500"
                              >
                                Открыть
                              </a>
                            ) : null}
                            {item.type !== 'file' && item.url ? (
                              <a
                                href={item.url}
                                target="_blank"
                                rel="noreferrer"
                                className="font-semibold text-sky-600 hover:text-sky-500"
                              >
                                Открыть
                              </a>
                            ) : null}
                            <button
                              type="button"
                              onClick={() => void removeAttachment(item)}
                              className="text-rose-600 hover:text-rose-500"
                            >
                              Удалить
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>

              <div className="space-y-5">
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="block">
                    <span className="text-xs font-semibold uppercase tracking-widest text-slate-500 dark:text-slate-400">
                      Ответственный
                    </span>
                    <select
                      value={draft.assignee ?? ''}
                      onChange={(event) => {
                        if (!selectedCardId) return
                        const next = event.target.value ? Number(event.target.value) : null
                        setDraft((prev) => (prev ? { ...prev, assignee: next } : prev))
                      }}
                      className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                    >
                      <option value="">Не назначен</option>
                      {assignees.map((assignee) => (
                        <option key={assignee.id} value={assignee.id}>
                          {assignee.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block">
                    <span className="text-xs font-semibold uppercase tracking-widest text-slate-500 dark:text-slate-400">
                      Срок выполнения
                    </span>
                    <input
                      type="datetime-local"
                      value={draft.deadline}
                      onChange={(event) => {
                        if (!selectedCardId) return
                        const value = event.target.value
                        setDraft((prev) => (prev ? { ...prev, deadline: value } : prev))
                        scheduleDeadlineSave()
                      }}
                      className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                    />
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      Выберите дату и время завершения задачи.
                    </p>
                  </label>
                </div>

                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-950">
                  <h3 className="text-sm font-semibold">Приоритет</h3>
                  <div className="mt-3 grid gap-2 text-sm">
                    {[
                      { marker: '🔥', label: 'срочно' },
                      { marker: '🟡', label: 'важно (до конца недели)' },
                      { marker: '🟢', label: 'можно когда будет время' },
                    ].map((item) => (
                      <label key={item.label} className="flex items-center gap-2">
                        <input
                          type="radio"
                          name="priority"
                          checked={selectedPriority === item.marker}
                          onChange={() => {
                            if (!selectedCardId) return
                            setDraft((prev) => (prev ? { ...prev, priority: item.marker as '🔥' | '🟡' | '🟢' } : prev))
                          }}
                          className="h-4 w-4 text-sky-600"
                        />
                        {item.marker} {item.label}
                      </label>
                    ))}
                  </div>
                </div>

                <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-950">
                  <h3 className="text-sm font-semibold">Теги и категории</h3>
                  <div className="mt-3 grid gap-3">
                    <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-3 text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
                      <p className="font-semibold">Доступные теги</p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {allKnownTags.length === 0 ? (
                          <span className="text-slate-500 dark:text-slate-400">Пока нет тегов в этой доске.</span>
                        ) : (
                          allKnownTags
                            .filter((tag) => !selectedTags.includes(tag))
                            .filter((tag) => (newTag.trim() ? tag.toLowerCase().includes(newTag.trim().toLowerCase()) : true))
                            .map((tag) => (
                              <button
                                key={tag}
                                type="button"
                                onClick={() => addTagValue(tag)}
                                className="rounded-full border border-slate-200 bg-white px-3 py-1 font-semibold uppercase tracking-wide text-slate-600 transition hover:border-sky-300 hover:text-sky-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
                              >
                                + {tag}
                              </button>
                            ))
                        )}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2 text-xs">
                      {selectedTags.length === 0 ? (
                        <span className="text-xs text-slate-500 dark:text-slate-400">Теги не добавлены.</span>
                      ) : (
                        selectedTags.map((tag) => (
                          <span
                            key={tag}
                            className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-3 py-1 font-semibold uppercase tracking-wide text-slate-500 dark:border-slate-700 dark:text-slate-300"
                          >
                            {tag}
                            <button
                              type="button"
                              onClick={() => removeTag(tag)}
                              className="text-rose-500 hover:text-rose-400"
                            >
                              ×
                            </button>
                          </span>
                        ))
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        value={newTag}
                        onChange={(event) => setNewTag(event.target.value)}
                        placeholder="Новый тег"
                        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                      />
                      <button type="button" onClick={addTag} className="rounded-lg bg-sky-600 px-3 py-2 text-xs font-semibold text-white">
                        Добавить
                      </button>
                    </div>

                    <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-3 text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
                      <p className="font-semibold">Доступные категории</p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {allKnownCategories.length === 0 ? (
                          <span className="text-slate-500 dark:text-slate-400">Пока нет категорий в этой доске.</span>
                        ) : (
                          allKnownCategories
                            .filter((category) => !selectedCategories.includes(category))
                            .filter((category) =>
                              newCategory.trim() ? category.toLowerCase().includes(newCategory.trim().toLowerCase()) : true
                            )
                            .map((category) => (
                              <button
                                key={category}
                                type="button"
                                onClick={() => addCategoryValue(category)}
                                className="rounded-full border border-slate-200 bg-white px-3 py-1 font-semibold uppercase tracking-wide text-slate-600 transition hover:border-emerald-300 hover:text-emerald-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
                              >
                                + {category}
                              </button>
                            ))
                        )}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2 text-xs">
                      {selectedCategories.length === 0 ? (
                        <span className="text-xs text-slate-500 dark:text-slate-400">Категории не добавлены.</span>
                      ) : (
                        selectedCategories.map((category) => (
                          <span
                            key={category}
                            className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 font-semibold uppercase tracking-wide text-slate-600 dark:bg-slate-800 dark:text-slate-300"
                          >
                            {category}
                            <button
                              type="button"
                              onClick={() => removeCategory(category)}
                              className="text-rose-500 hover:text-rose-400"
                            >
                              ×
                            </button>
                          </span>
                        ))
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        value={newCategory}
                        onChange={(event) => setNewCategory(event.target.value)}
                        placeholder="Новая категория"
                        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                      />
                      <button type="button" onClick={addCategory} className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white">
                        Добавить
                      </button>
                    </div>
                  </div>
                </div>

              </div>
            </div>
          </div>
        </div>
      ) : null}

      {toast ? (
        <div className="fixed bottom-4 left-1/2 z-[60] w-[min(720px,calc(100%-2rem))] -translate-x-1/2">
          <div
            className={`rounded-2xl border px-4 py-3 shadow-lg backdrop-blur dark:bg-slate-950/90 ${
              toast.tone === 'error'
                ? 'border-rose-200 bg-white/95 text-slate-900 dark:border-rose-900/50 dark:text-slate-100'
                : 'border-slate-200 bg-white/95 text-slate-900 dark:border-slate-800 dark:text-slate-100'
            }`}
            role="status"
          >
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm font-medium">{toast.message}</p>
              <div className="flex items-center gap-2">
                {toast.retry ? (
                  <button
                    type="button"
                    onClick={() => void retryToast()}
                    disabled={toastSending}
                    className="inline-flex items-center justify-center rounded-xl bg-slate-900 px-3 py-2 text-xs font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
                  >
                    {toastSending ? 'Отправка…' : 'Повторить'}
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => setToast(null)}
                  className="inline-flex items-center justify-center rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200"
                >
                  Закрыть
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

function LoginPage({ onLogin, token }: { onLogin: (user: AuthUser) => void; token: string | null }) {
  const navigate = useNavigate()
  const location = useLocation()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [registrationStatus, setRegistrationStatus] = useState<RegistrationStatus | null>(null)
  const [checkingRegistration, setCheckingRegistration] = useState(true)

  useEffect(() => {
    setCheckingRegistration(true)
    api
      .registrationStatus()
      .then((status) => setRegistrationStatus(status))
      .catch(() => setRegistrationStatus(null))
      .finally(() => setCheckingRegistration(false))
  }, [])

  if (token) {
    return <Navigate to="/" replace />
  }

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setError('')
    setLoading(true)
    try {
      const user = await api.login({ username: username.trim(), password })
      onLogin(user)
      const boards = await api.listBoards()
      if (boards.length === 1) {
        navigate(`/boards/${boards[0]?.id}`, { replace: true })
      } else {
        const next = (location.state as { from?: string } | null)?.from
        navigate(next || '/', { replace: true })
      }
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-12 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <div className="mx-auto w-full max-w-md space-y-6">
        <header className="space-y-2 text-center">
          <p className="text-sm font-semibold uppercase tracking-widest text-sky-600 dark:text-sky-400">
            Task Manager
          </p>
          <h1 className="text-3xl font-semibold">Вход</h1>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Войдите, чтобы увидеть ваши доски.
          </p>
        </header>

        <form
          onSubmit={onSubmit}
          className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900"
        >
          <div className="space-y-4">
            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-widest text-slate-500 dark:text-slate-400">
                Логин
              </span>
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              />
            </label>
            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-widest text-slate-500 dark:text-slate-400">
                Пароль
              </span>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              />
            </label>
            {error ? <p className="text-sm text-rose-600">{error}</p> : null}
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl bg-sky-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-sky-500 disabled:opacity-60"
            >
              Войти
            </button>
          </div>
        </form>

        {!checkingRegistration && registrationStatus?.allow_first ? (
          <div className="text-center text-sm text-slate-500 dark:text-slate-400">
            Первый вход?{' '}
            <Link to="/register" className="font-semibold text-sky-600 hover:text-sky-500">
              Зарегистрироваться
            </Link>
          </div>
        ) : null}
      </div>
    </div>
  )
}

function RegisterPage({ user }: { user: AuthUser | null }) {
  const navigate = useNavigate()
  const [status, setStatus] = useState<RegistrationStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [role, setRole] = useState<UserRole>('viewer')
  const [permissions, setPermissions] = useState<PermissionKey[]>([])
  const [useCustomPermissions, setUseCustomPermissions] = useState(false)
  const [error, setError] = useState('')
  const [successMessage, setSuccessMessage] = useState('')
  const [saving, setSaving] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [formErrors, setFormErrors] = useState<Record<string, string>>({})

  useEffect(() => {
    api
      .registrationStatus()
      .then((data) => setStatus(data))
      .catch(() => setStatus(null))
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return <div className="p-6 text-slate-600 dark:text-slate-300">Loading…</div>
  }

  const allow = Boolean(status?.allow_first || status?.allow_admin)
  if (!allow) {
    return (
      <div className="min-h-screen bg-slate-50 px-4 py-12 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
        <div className="mx-auto w-full max-w-lg space-y-4">
          <h1 className="text-2xl font-semibold">Регистрация недоступна</h1>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Регистрация возможна только при пустой базе или через администратора.
          </p>
          <Link
            to={user ? '/settings' : '/login'}
            className="inline-flex items-center gap-2 rounded-xl bg-sky-600 px-4 py-2 text-sm font-semibold text-white"
          >
            {user ? 'Вернуться в настройки' : 'Ко входу'}
          </Link>
        </div>
      </div>
    )
  }

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setError('')
    setSuccessMessage('')
    const trimmedUsername = username.trim()
    const trimmedName = fullName.trim()
    const nextErrors: Record<string, string> = {}
    if (!trimmedName) nextErrors.fullName = 'Введите имя'
    if (!trimmedUsername || trimmedUsername.length < 3) nextErrors.username = 'Минимум 3 символа'
    if (!password || password.length < 8) nextErrors.password = 'Минимум 8 символов'
    if (!role) nextErrors.role = 'Выберите роль'
    if (useCustomPermissions && permissions.length === 0) {
      nextErrors.permissions = 'Выберите хотя бы одно право'
    }
    setFormErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) return
    if (!confirmOpen) {
      setConfirmOpen(true)
      return
    }
    setSaving(true)
    try {
      await api.register({
        username: trimmedUsername,
        password,
        full_name: trimmedName,
        role,
        permissions: useCustomPermissions ? permissions : undefined,
      })
      setConfirmOpen(false)
      setSuccessMessage('Пользователь успешно создан. Можно добавить следующего.')
      setUsername('')
      setPassword('')
      setFullName('')
      setRole('viewer')
      setPermissions([])
      setUseCustomPermissions(false)
      if (status?.allow_first) {
        navigate('/login', { replace: true })
      } else {
        navigate('/settings', { replace: true })
      }
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSaving(false)
    }
  }


  return (
    <div className="min-h-screen bg-slate-50 px-4 py-12 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <div className="mx-auto w-full max-w-5xl space-y-6">
        <header className="space-y-2">
          <p className="text-sm font-semibold uppercase tracking-widest text-sky-600 dark:text-sky-400">
            Task Manager
          </p>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h1 className="text-3xl font-semibold">Создание пользователя</h1>
              <p className="text-sm text-slate-600 dark:text-slate-400">
                Заполните карточку доступа и назначьте права.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Link
                to={status?.allow_first ? '/login' : '/settings'}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200"
              >
                Назад
              </Link>
              <button
                type="button"
                onClick={toggleTheme}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200"
              >
                🌓 Тема
              </button>
            </div>
          </div>
        </header>

        <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <form
            onSubmit={onSubmit}
            className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900"
          >
            <div className="space-y-6">
              <section className="space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-semibold">Данные учетной записи</h2>
                  <span className="rounded-full bg-sky-500/10 px-2 py-1 text-xs font-semibold text-sky-600 dark:text-sky-300">
                    Аккаунт
                  </span>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="block">
                    <span className="text-xs font-semibold uppercase tracking-widest text-slate-500 dark:text-slate-400">
                      Имя и фамилия
                    </span>
                    <input
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                    />
                    {formErrors.fullName ? (
                      <p className="mt-1 text-xs text-rose-600">{formErrors.fullName}</p>
                    ) : null}
                  </label>
                  <label className="block">
                    <span className="text-xs font-semibold uppercase tracking-widest text-slate-500 dark:text-slate-400">
                      Логин
                    </span>
                    <input
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                    />
                    {formErrors.username ? (
                      <p className="mt-1 text-xs text-rose-600">{formErrors.username}</p>
                    ) : null}
                  </label>
                  <label className="block sm:col-span-2">
                    <span className="text-xs font-semibold uppercase tracking-widest text-slate-500 dark:text-slate-400">
                      Пароль
                    </span>
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                    />
                    {formErrors.password ? (
                      <p className="mt-1 text-xs text-rose-600">{formErrors.password}</p>
                    ) : null}
                  </label>
                </div>
              </section>

              <section className="space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-semibold">Роли и доступ</h2>
                  <span className="rounded-full bg-emerald-500/10 px-2 py-1 text-xs font-semibold text-emerald-600 dark:text-emerald-300">
                    Безопасность
                  </span>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="block">
                    <span className="text-xs font-semibold uppercase tracking-widest text-slate-500 dark:text-slate-400">
                      Роль
                    </span>
                    <select
                      value={role}
                      onChange={(e) => setRole(e.target.value as UserRole)}
                      className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                    >
                      <option value="admin">Администратор</option>
                      <option value="manager">Менеджер</option>
                      <option value="editor">Редактор</option>
                      <option value="viewer">Наблюдатель</option>
                    </select>
                    {formErrors.role ? (
                      <p className="mt-1 text-xs text-rose-600">{formErrors.role}</p>
                    ) : null}
                  </label>
                  <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-3 text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300">
                    <p className="font-semibold">Подсказка</p>
                    <p className="mt-1">
                      Роль задает базовый набор прав. При необходимости включите ручную настройку.
                    </p>
                  </div>
                </div>
                <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                  <input
                    type="checkbox"
                    checked={useCustomPermissions}
                    onChange={(event) => setUseCustomPermissions(event.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-sky-600"
                  />
                  Настроить права вручную
                </label>
                {useCustomPermissions ? (
                  <div className="grid gap-3 sm:grid-cols-2">
                    {permissionCatalog.map((permission) => {
                      const checked = permissions.includes(permission.key)
                      return (
                        <label
                          key={permission.key}
                          className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm shadow-sm dark:border-slate-700 dark:bg-slate-950"
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(event) => {
                              setPermissions((current) =>
                                event.target.checked
                                  ? [...current, permission.key]
                                  : current.filter((item) => item !== permission.key)
                              )
                            }}
                            className="mt-1 h-4 w-4 rounded border-slate-300 text-sky-600"
                          />
                          <span>
                            <span className="font-semibold text-slate-900 dark:text-slate-100">
                              {permission.label}
                            </span>
                            <span className="mt-1 block text-xs text-slate-500 dark:text-slate-400">
                              {permission.desc}
                            </span>
                          </span>
                        </label>
                      )
                    })}
                    {formErrors.permissions ? (
                      <p className="text-xs text-rose-600 sm:col-span-2">{formErrors.permissions}</p>
                    ) : null}
                  </div>
                ) : null}
              </section>

              {error ? <p className="text-sm text-rose-600">{error}</p> : null}
              {successMessage ? <p className="text-sm text-emerald-600">{successMessage}</p> : null}
              <button
                type="submit"
                disabled={saving}
                className="w-full rounded-xl bg-sky-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-sky-500 disabled:opacity-60"
              >
                Создать пользователя
              </button>
            </div>
          </form>

          <aside className="space-y-6">
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <h3 className="text-lg font-semibold">Дизайн раздела настроек</h3>
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
                Раздел построен по принципу карточек: каждый блок отвечает за конкретную зону управления.
              </p>
              <ul className="mt-4 space-y-3 text-sm text-slate-600 dark:text-slate-300">
                <li className="flex items-start gap-2">
                  <span className="mt-1 h-2 w-2 rounded-full bg-sky-500" aria-hidden="true" />
                  Аккаунт: профиль, контактные данные, язык.
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-1 h-2 w-2 rounded-full bg-emerald-500" aria-hidden="true" />
                  Безопасность: роли, пароли, активные сессии.
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-1 h-2 w-2 rounded-full bg-amber-500" aria-hidden="true" />
                  Уведомления: каналы, расписания, критичность.
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-1 h-2 w-2 rounded-full bg-indigo-500" aria-hidden="true" />
                  Предпочтения: тема, формат дат, плотность интерфейса.
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-1 h-2 w-2 rounded-full bg-teal-500" aria-hidden="true" />
                  Доступность: контраст, размер шрифта, озвучка.
                </li>
              </ul>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <h3 className="text-lg font-semibold">Статус создания</h3>
              <div className="mt-3 space-y-3 text-sm text-slate-600 dark:text-slate-400">
                <p>Перед созданием пользователя система попросит подтвердить действие.</p>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300">
                  {confirmOpen
                    ? 'Подтверждение ожидает вашего решения.'
                    : 'Подтверждение не запрашивалось.'}
                </div>
              </div>
            </section>
          </aside>
        </div>
      </div>

      {confirmOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl dark:bg-slate-900">
            <h3 className="text-lg font-semibold">Подтвердите создание</h3>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
              Создать пользователя <span className="font-semibold">{fullName || username}</span> с ролью{' '}
              <span className="font-semibold">{role}</span>?
            </p>
            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmOpen(false)}
                className="inline-flex items-center justify-center rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200"
              >
                Отмена
              </button>
              <button
                type="button"
                onClick={(event) => onSubmit(event as unknown as React.FormEvent)}
                className="inline-flex items-center justify-center rounded-xl bg-sky-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-sky-500"
              >
                Подтвердить
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

function SettingsPage({ user, onLogout }: { user: AuthUser; onLogout: () => void }) {
  const [users, setUsers] = useState<AdminUser[]>([])
  const [loadingUsers, setLoadingUsers] = useState(false)
  const [usersError, setUsersError] = useState('')
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null)
  const [editRole, setEditRole] = useState<UserRole>('viewer')
  const [editPermissions, setEditPermissions] = useState<PermissionKey[]>([])
  const [useCustomPermissions, setUseCustomPermissions] = useState(false)
  const [editFullName, setEditFullName] = useState('')
  const [savingUser, setSavingUser] = useState(false)
  const [editErrors, setEditErrors] = useState<Record<string, string>>({})
  const [passwordOpen, setPasswordOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const [newPassword, setNewPassword] = useState('')
  const [passwordError, setPasswordError] = useState('')
  const [passwordSaving, setPasswordSaving] = useState(false)
  const [notificationProfile, setNotificationProfile] = useState<NotificationProfile | null>(null)
  const [notificationPrefs, setNotificationPrefs] = useState<NotificationPreference[]>([])
  const [notificationSaving, setNotificationSaving] = useState(false)
  const [notificationError, setNotificationError] = useState('')
  const [notificationBoardFilter, setNotificationBoardFilter] = useState<'all' | number>('all')
  const [notificationBoards, setNotificationBoards] = useState<Board[]>([])
  const [overdueInterval, setOverdueInterval] = useState<number>(30)
  const [overdueIntervalSaving, setOverdueIntervalSaving] = useState(false)

  const loadUsers = async () => {
    if (!user.is_admin) return
    setLoadingUsers(true)
    setUsersError('')
    try {
      const data = await api.listUsers()
      setUsers(data)
      if (!selectedUser && data.length > 0) {
        const first = data[0]!
        setSelectedUser(first)
        setEditRole(first.role)
        setEditPermissions(first.permissions)
        setEditFullName(first.full_name)
      }
    } catch (e) {
      setUsersError((e as Error).message)
    } finally {
      setLoadingUsers(false)
    }
  }

  useEffect(() => {
    if (user.is_admin) {
      void loadUsers()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.is_admin])

  useEffect(() => {
    const loadNotifications = async () => {
      try {
        const profile = await api.getNotificationProfile()
        setNotificationProfile(profile)
        const prefs = await api.listNotificationPreferences()
        setNotificationPrefs(prefs)
        const boards = await api.listBoards()
        setNotificationBoards(boards)
        if (user.is_admin) {
          const settings = await api.getSiteSettings()
          setOverdueInterval(settings.overdue_reminder_interval)
        }
      } catch (e) {
        setNotificationError((e as Error).message)
      }
    }
    void loadNotifications()
  }, [])

  const eventCatalog: { value: NotificationEventType; label: string }[] = [
    { value: 'board.created', label: 'Создание досок' },
    { value: 'board.updated', label: 'Редактирование досок' },
    { value: 'board.deleted', label: 'Удаление досок' },
    { value: 'column.created', label: 'Создание колонок' },
    { value: 'column.updated', label: 'Редактирование колонок' },
    { value: 'column.deleted', label: 'Удаление колонок' },
    { value: 'card.created', label: 'Создание карточек' },
    { value: 'card.updated', label: 'Редактирование карточек' },
    { value: 'card.deleted', label: 'Удаление карточек' },
    { value: 'card.moved', label: 'Перемещение карточек' },
  ]

  const channelCatalog: { value: NotificationChannel; label: string }[] = [
    { value: 'email', label: 'Email' },
    { value: 'telegram', label: 'Telegram' },
  ]

  const togglePreference = async (
    channel: NotificationChannel,
    eventType: NotificationEventType,
    enabled: boolean
  ) => {
    if (notificationSaving) return
    setNotificationSaving(true)
    setNotificationError('')
    try {
      const targetBoard = notificationBoardFilter === 'all' ? null : notificationBoardFilter
      const existing = notificationPrefs.find(
        (pref) => pref.channel === channel && pref.event_type === eventType && pref.board === targetBoard
      )
      if (existing) {
        const updated = await api.updateNotificationPreference(existing.id, { enabled })
        setNotificationPrefs((prev) => prev.map((item) => (item.id === updated.id ? updated : item)))
      } else {
        const created = await api.createNotificationPreference({
          channel,
          event_type: eventType,
          enabled,
          board: targetBoard,
        })
        setNotificationPrefs((prev) => [...prev, created])
      }
    } catch (e) {
      setNotificationError((e as Error).message)
    } finally {
      setNotificationSaving(false)
    }
  }

  const getPreferenceEnabled = (
    channel: NotificationChannel,
    eventType: NotificationEventType
  ): boolean => {
    const targetBoard = notificationBoardFilter === 'all' ? null : notificationBoardFilter
    const pref = notificationPrefs.find(
      (item) => item.channel === channel && item.event_type === eventType && item.board === targetBoard
    )
    return pref ? pref.enabled : true
  }

  const saveProfile = async (payload: Partial<NotificationProfile>) => {
    if (notificationSaving) return
    setNotificationSaving(true)
    setNotificationError('')
    try {
      const updated = await api.updateNotificationProfile(payload)
      setNotificationProfile(updated)
    } catch (e) {
      setNotificationError((e as Error).message)
    } finally {
      setNotificationSaving(false)
    }
  }

  const saveBoardNotificationContacts = async (boardId: number, payload: { notification_email?: string; notification_telegram_chat_id?: string }) => {
    if (notificationSaving) return
    setNotificationSaving(true)
    setNotificationError('')
    try {
      const updated = await api.updateBoard(boardId, payload)
      setNotificationBoards((prev) => prev.map((item) => (item.id === updated.id ? updated : item)))
    } catch (e) {
      setNotificationError((e as Error).message)
    } finally {
      setNotificationSaving(false)
    }
  }

  const selectUser = (next: AdminUser) => {
    setSelectedUser(next)
    setEditRole(next.role)
    setEditPermissions(next.permissions)
    setEditFullName(next.full_name)
    setUseCustomPermissions(false)
    setEditErrors({})
    setPasswordOpen(false)
    setProfileOpen(false)
    setNewPassword('')
    setPasswordError('')
  }

  const onSaveUser = async () => {
    if (!selectedUser) return
    const nextErrors: Record<string, string> = {}
    if (!editFullName.trim()) nextErrors.fullName = 'Введите имя'
    if (!editRole) nextErrors.role = 'Выберите роль'
    if (useCustomPermissions && editPermissions.length === 0) {
      nextErrors.permissions = 'Выберите хотя бы одно право'
    }
    setEditErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) return

    setSavingUser(true)
    setUsersError('')
    try {
      const payload = {
        full_name: editFullName.trim(),
        role: editRole,
        permissions: useCustomPermissions ? editPermissions : rolePresets[editRole],
      }
      const updated = await api.updateUser(selectedUser.id, payload)
      setUsers((prev) => prev.map((item) => (item.id === updated.id ? updated : item)))
      setSelectedUser(updated)
      setEditRole(updated.role)
      setEditPermissions(updated.permissions)
    } catch (e) {
      setUsersError((e as Error).message)
    } finally {
      setSavingUser(false)
    }
  }

  const onChangePassword = async () => {
    if (!selectedUser) return
    const trimmed = newPassword.trim()
    if (trimmed.length < 8) {
      setPasswordError('Минимум 8 символов')
      return
    }
    setPasswordError('')
    setPasswordSaving(true)
    try {
      await api.changeUserPassword(selectedUser.id, { new_password: trimmed })
      setPasswordOpen(false)
      setNewPassword('')
    } catch (e) {
      setPasswordError((e as Error).message)
    } finally {
      setPasswordSaving(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-12 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <div className="mx-auto w-full max-w-6xl space-y-6">
        <header className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-semibold">Настройки</h1>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Управление учетной записью и доступом.
            </p>
          </div>
          <Link
            to="/"
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200"
          >
            Назад к доскам
          </Link>
        </header>

        <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="space-y-6">
            <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm text-slate-500 dark:text-slate-400">Пользователь</p>
                  <p className="text-lg font-semibold">
                    {user.full_name || user.username}{' '}
                    {user.is_admin ? (
                      <span className="ml-2 rounded-full bg-emerald-500/10 px-2 py-1 text-xs font-semibold text-emerald-600 dark:text-emerald-300">
                        Администратор
                      </span>
                    ) : null}
                  </p>
                </div>
                <button
                  onClick={onLogout}
                  className="inline-flex items-center gap-2 rounded-xl border border-rose-200 px-4 py-2 text-sm font-semibold text-rose-600 shadow-sm transition hover:border-rose-300"
                >
                  Выйти
                </button>
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold">Аккаунт</h2>
                  <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                    Личные данные, рабочий профиль, язык интерфейса.
                  </p>
                </div>
                <span className="rounded-full bg-sky-500/10 px-2 py-1 text-xs font-semibold text-sky-600 dark:text-sky-300">
                  Профиль
                </span>
              </div>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className="text-xs font-semibold uppercase tracking-widest text-slate-500 dark:text-slate-400">
                    Имя
                  </span>
                  <input
                    defaultValue={user.full_name || user.username}
                    className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-semibold uppercase tracking-widest text-slate-500 dark:text-slate-400">
                    Email
                  </span>
                  <input
                    placeholder="name@company.com"
                    className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-semibold uppercase tracking-widest text-slate-500 dark:text-slate-400">
                    Язык интерфейса
                  </span>
                  <select className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100">
                    <option>Русский</option>
                    <option>English</option>
                    <option>Deutsch</option>
                  </select>
                </label>
                <label className="block">
                  <span className="text-xs font-semibold uppercase tracking-widest text-slate-500 dark:text-slate-400">
                    Часовой пояс</span>
                  <select className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100">
                    <option>Москва (UTC+3)</option>
                    <option>UTC</option>
                    <option>GMT+2</option>
                  </select>
                </label>
              </div>
              <button className="mt-4 inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200">
                Сохранить изменения
              </button>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold">Безопасность</h2>
                  <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                    Пароли, сессии, контроль доступа и 2FA.
                  </p>
                </div>
                <span className="rounded-full bg-emerald-500/10 px-2 py-1 text-xs font-semibold text-emerald-600 dark:text-emerald-300">
                  Доступ
                </span>
              </div>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300">
                  <p className="font-semibold text-slate-900 dark:text-slate-100">Активные сессии</p>
                  <p className="mt-1">Последний вход: 10 минут назад</p>
                  <button className="mt-3 inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 dark:border-slate-700 dark:text-slate-300">
                    Завершить все сеансы
                  </button>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300">
                  <p className="font-semibold text-slate-900 dark:text-slate-100">Пароль</p>
                  <p className="mt-1">Обновляйте пароль раз в 90 дней.</p>
                  <button className="mt-3 inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 dark:border-slate-700 dark:text-slate-300">
                    Сменить пароль
                  </button>
                </div>
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold">Уведомления</h2>
                  <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                    Каналы, уровни и типы уведомлений по событиям.
                  </p>
                </div>
                <span className="rounded-full bg-amber-500/10 px-2 py-1 text-xs font-semibold text-amber-600 dark:text-amber-300">
                  Коммуникации
                </span>
              </div>
              <div className="mt-4 space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="block">
                    <span className="text-xs font-semibold uppercase tracking-widest text-slate-500 dark:text-slate-400">
                      Уровень настроек
                    </span>
                    <select
                      value={notificationBoardFilter === 'all' ? 'all' : String(notificationBoardFilter)}
                      onChange={(event) => {
                        const value = event.target.value
                        setNotificationBoardFilter(value === 'all' ? 'all' : Number(value))
                      }}
                      className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                    >
                      <option value="all">Все доски (глобально)</option>
                      {notificationBoards.map((board) => (
                        <option key={board.id} value={board.id}>
                          {board.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs text-slate-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-400">
                    Выберите доску, чтобы переопределить глобальные правила.
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="block">
                    <span className="text-xs font-semibold uppercase tracking-widest text-slate-500 dark:text-slate-400">
                      Email
                    </span>
                    <input
                      value={
                        notificationBoardFilter === 'all'
                          ? notificationProfile?.email ?? ''
                          : notificationBoards.find((board) => board.id === notificationBoardFilter)?.notification_email ?? ''
                      }
                      onChange={(event) => {
                        const value = event.target.value
                        if (notificationBoardFilter === 'all') {
                          setNotificationProfile((prev) => ({
                            email: value,
                            telegram_chat_id: prev?.telegram_chat_id ?? '',
                            timezone: prev?.timezone ?? 'UTC',
                          }))
                          return
                        }
                        setNotificationBoards((prev) =>
                          prev.map((board) =>
                            board.id === notificationBoardFilter ? { ...board, notification_email: value } : board
                          )
                        )
                      }}
                      onBlur={(event) => {
                        const value = event.target.value
                        if (notificationBoardFilter === 'all') {
                          void saveProfile({ email: value })
                        } else {
                          void saveBoardNotificationContacts(notificationBoardFilter, { notification_email: value })
                        }
                      }}
                      placeholder="name@company.com"
                      className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs font-semibold uppercase tracking-widest text-slate-500 dark:text-slate-400">
                      Telegram chat_id
                    </span>
                    <input
                      value={
                        notificationBoardFilter === 'all'
                          ? notificationProfile?.telegram_chat_id ?? ''
                          : notificationBoards.find((board) => board.id === notificationBoardFilter)
                              ?.notification_telegram_chat_id ?? ''
                      }
                      onChange={(event) => {
                        const value = event.target.value
                        if (notificationBoardFilter === 'all') {
                          setNotificationProfile((prev) => ({
                            email: prev?.email ?? '',
                            telegram_chat_id: value,
                            timezone: prev?.timezone ?? 'UTC',
                          }))
                          return
                        }
                        setNotificationBoards((prev) =>
                          prev.map((board) =>
                            board.id === notificationBoardFilter
                              ? { ...board, notification_telegram_chat_id: value }
                              : board
                          )
                        )
                      }}
                      onBlur={(event) => {
                        const value = event.target.value
                        if (notificationBoardFilter === 'all') {
                          void saveProfile({ telegram_chat_id: value })
                        } else {
                          void saveBoardNotificationContacts(notificationBoardFilter, { notification_telegram_chat_id: value })
                        }
                      }}
                      placeholder="123456789"
                      className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                    />
                  </label>
                </div>

                <div className="space-y-3">
                  {eventCatalog.map((eventItem) => (
                    <div key={eventItem.value} className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-950">
                      <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                        {eventItem.label}
                      </p>
                      <div className="mt-3 grid gap-3 sm:grid-cols-2">
                        {channelCatalog.map((channelItem) => (
                          <label
                            key={`${eventItem.value}-${channelItem.value}`}
                            className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                          >
                            {channelItem.label}
                            <input
                              type="checkbox"
                              checked={getPreferenceEnabled(channelItem.value, eventItem.value)}
                              onChange={(event) =>
                                void togglePreference(channelItem.value, eventItem.value, event.target.checked)
                              }
                              className="h-4 w-4 rounded border-slate-300 text-sky-600"
                            />
                          </label>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
                {notificationError ? <p className="text-sm text-rose-600">{notificationError}</p> : null}

                {user.is_admin ? (
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-950">
                    <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                      Повторяющиеся напоминания о просроченных задачах
                    </p>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      Интервал отправки push-уведомлений о просроченных задачах всем пользователям.
                    </p>
                    <div className="mt-3 flex items-center gap-3">
                      <select
                        value={overdueInterval}
                        onChange={(e) => {
                          const val = Number(e.target.value)
                          setOverdueInterval(val)
                          setOverdueIntervalSaving(true)
                          api.updateSiteSettings({ overdue_reminder_interval: val })
                            .then((s) => setOverdueInterval(s.overdue_reminder_interval))
                            .catch(() => {})
                            .finally(() => setOverdueIntervalSaving(false))
                        }}
                        disabled={overdueIntervalSaving}
                        className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                      >
                        <option value={5}>5 минут</option>
                        <option value={10}>10 минут</option>
                        <option value={30}>30 минут</option>
                        <option value={60}>1 час</option>
                      </select>
                      {overdueIntervalSaving ? (
                        <span className="text-xs text-slate-400">Сохранение…</span>
                      ) : null}
                    </div>
                  </div>
                ) : null}
              </div>
            </section>
          </div>

          <div className="space-y-6">
            <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold">Персональные предпочтения</h2>
                  <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                    Внешний вид и плотность интерфейса.
                  </p>
                </div>
                <span className="rounded-full bg-indigo-500/10 px-2 py-1 text-xs font-semibold text-indigo-600 dark:text-indigo-300">
                  UI</span>
              </div>
              <div className="mt-4 grid gap-4">
                <label className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm dark:border-slate-700 dark:bg-slate-950">
                  Компактный режим
                  <input type="checkbox" className="h-4 w-4 rounded border-slate-300 text-sky-600" />
                </label>
                <label className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm dark:border-slate-700 dark:bg-slate-950">
                  Показывать быстрые подсказки
                  <input type="checkbox" defaultChecked className="h-4 w-4 rounded border-slate-300 text-sky-600" />
                </label>
                <label className="block">
                  <span className="text-xs font-semibold uppercase tracking-widest text-slate-500 dark:text-slate-400">
                    Формат дат
                  </span>
                  <select className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100">
                    <option>ДД.ММ.ГГГГ</option>
                    <option>ММ/ДД/ГГГГ</option>
                    <option>ГГГГ-ММ-ДД</option>
                  </select>
                </label>
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold">Доступность</h2>
                  <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                    Контраст, размер шрифта и ассистивные функции.
                  </p>
                </div>
                <span className="rounded-full bg-teal-500/10 px-2 py-1 text-xs font-semibold text-teal-600 dark:text-teal-300">
                  A11y</span>
              </div>
              <div className="mt-4 space-y-4">
                <label className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm dark:border-slate-700 dark:bg-slate-950">
                  Повышенный контраст
                  <input type="checkbox" className="h-4 w-4 rounded border-slate-300 text-sky-600" />
                </label>
                <label className="block">
                  <span className="text-xs font-semibold uppercase tracking-widest text-slate-500 dark:text-slate-400">
                    Размер шрифта
                  </span>
                  <input
                    type="range"
                    min={12}
                    max={20}
                    defaultValue={14}
                    className="mt-2 w-full"
                  />
                  <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">14 px</div>
                </label>
                <label className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm dark:border-slate-700 dark:bg-slate-950">
                  Озвучивание событий
                  <input type="checkbox" className="h-4 w-4 rounded border-slate-300 text-sky-600" />
                </label>
              </div>
            </section>

            {user.is_admin ? (
              <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-lg font-semibold">Пользователи</h2>
                    <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                      Управляйте пользователями, ролями и доступами.
                    </p>
                  </div>
                  <Link
                    to="/register"
                    className="inline-flex items-center gap-2 rounded-xl bg-sky-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-sky-500"
                  >
                    Создать пользователя
                  </Link>
                </div>

                <div className="mt-6 grid gap-4 lg:grid-cols-[0.8fr_1.2fr] xl:grid-cols-[0.7fr_1.3fr]">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between text-sm text-slate-500 dark:text-slate-400">
                      <span>Список пользователей</span>
                      <button
                        type="button"
                        onClick={loadUsers}
                        className="rounded-lg border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-600 dark:border-slate-700 dark:text-slate-300"
                      >
                        Обновить
                      </button>
                    </div>
                    <div className="space-y-2">
                      {loadingUsers ? (
                        <p className="text-sm text-slate-500 dark:text-slate-400">Загрузка…</p>
                      ) : null}
                      {users.map((item) => (
                        <div
                          key={item.id}
                          className={`w-full rounded-xl border px-3 py-3 text-left text-sm ${
                            selectedUser?.id === item.id
                              ? 'border-sky-500 bg-sky-50 text-slate-900 dark:border-sky-400 dark:bg-slate-900'
                              : 'border-slate-200 bg-white text-slate-600 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center justify-between">
                                <span className="truncate font-semibold">{item.full_name || item.username}</span>
                                <span className="ml-2 shrink-0 text-xs text-slate-400">#{item.id}</span>
                              </div>
                              <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">{item.username}</div>
                            </div>
                            <button
                              type="button"
                              onClick={() => selectUser(item)}
                              className="shrink-0 rounded-lg border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-600 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300"
                            >
                              Выбрать
                            </button>
                          </div>
                        </div>
                      ))}
                      {!loadingUsers && users.length === 0 ? (
                        <p className="text-sm text-slate-500 dark:text-slate-400">Пользователи не найдены.</p>
                      ) : null}
                    </div>
                    {usersError ? <p className="text-sm text-rose-600">{usersError}</p> : null}
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-950">
                    {selectedUser ? (
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-xs uppercase tracking-widest text-slate-500 dark:text-slate-400">
                              Профиль пользователя
                            </p>
                            <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                              {selectedUser.full_name || selectedUser.username}
                            </h3>
                          </div>
                          {selectedUser.is_admin ? (
                            <span className="rounded-full bg-emerald-500/10 px-2 py-1 text-xs font-semibold text-emerald-600 dark:text-emerald-300">
                              Админ
                            </span>
                          ) : null}
                        </div>
                        <p className="text-sm text-slate-600 dark:text-slate-400">
                          Откройте полный профиль, чтобы управлять ролью и правами пользователя.
                        </p>
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setProfileOpen(true)}
                            className="inline-flex items-center gap-2 rounded-xl bg-sky-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-sky-500"
                          >
                            Открыть профиль
                          </button>
                        </div>
                      </div>
                    ) : (
                      <p className="text-sm text-slate-500 dark:text-slate-400">Выберите пользователя.</p>
                    )}
                  </div>
                </div>
              </section>
            ) : null}
          </div>
        </div>
      </div>

      {passwordOpen && selectedUser ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl dark:bg-slate-900">
            <h3 className="text-lg font-semibold">Сменить пароль</h3>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
              Новый пароль для <span className="font-semibold">{selectedUser.username}</span>
            </p>
            <label className="mt-4 block">
              <span className="text-xs font-semibold uppercase tracking-widest text-slate-500 dark:text-slate-400">
                Новый пароль
              </span>
              <input
                type="password"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              />
            </label>
            {passwordError ? <p className="mt-2 text-sm text-rose-600">{passwordError}</p> : null}
            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setPasswordOpen(false)}
                className="inline-flex items-center justify-center rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200"
              >
                Отмена
              </button>
              <button
                type="button"
                disabled={passwordSaving}
                onClick={onChangePassword}
                className="inline-flex items-center justify-center rounded-xl bg-sky-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-sky-500 disabled:opacity-60"
              >
                Сохранить пароль
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {profileOpen && selectedUser ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-5xl rounded-2xl bg-white p-6 shadow-xl dark:bg-slate-900">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-widest text-slate-500 dark:text-slate-400">
                  Профиль пользователя
                </p>
                <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                  {selectedUser.full_name || selectedUser.username}
                </h3>
              </div>
              <div className="flex items-center gap-2">
                {selectedUser.is_admin ? (
                  <span className="rounded-full bg-emerald-500/10 px-2 py-1 text-xs font-semibold text-emerald-600 dark:text-emerald-300">
                    Админ
                  </span>
                ) : null}
                <button
                  type="button"
                  onClick={() => setProfileOpen(false)}
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200"
                >
                  Закрыть
                </button>
              </div>
            </div>

            <div className="mt-6 space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className="text-xs font-semibold uppercase tracking-widest text-slate-500 dark:text-slate-400">
                    Имя
                  </span>
                  <input
                    value={editFullName}
                    onChange={(event) => setEditFullName(event.target.value)}
                    className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                  />
                  {editErrors.fullName ? (
                    <p className="mt-1 text-xs text-rose-600">{editErrors.fullName}</p>
                  ) : null}
                </label>
                <label className="block">
                  <span className="text-xs font-semibold uppercase tracking-widest text-slate-500 dark:text-slate-400">
                    Роль
                  </span>
                  <select
                    value={editRole}
                    onChange={(event) => setEditRole(event.target.value as UserRole)}
                    className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                  >
                    <option value="admin">Администратор</option>
                    <option value="manager">Менеджер</option>
                    <option value="editor">Редактор</option>
                    <option value="viewer">Наблюдатель</option>
                  </select>
                  {editErrors.role ? (
                    <p className="mt-1 text-xs text-rose-600">{editErrors.role}</p>
                  ) : null}
                </label>
              </div>

              <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                <input
                  type="checkbox"
                  checked={useCustomPermissions}
                  onChange={(event) => {
                    const checked = event.target.checked
                    setUseCustomPermissions(checked)
                    if (!checked) {
                      setEditPermissions(rolePresets[editRole])
                    }
                  }}
                  className="h-4 w-4 rounded border-slate-300 text-sky-600"
                />
                Редактировать права вручную
              </label>

              {useCustomPermissions ? (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3 xl:gap-5">
                  {permissionCatalog.map((permission) => {
                    const checked = editPermissions.includes(permission.key)
                    return (
                      <label
                        key={permission.key}
                        className={`flex h-full w-full items-start gap-3 rounded-2xl border px-4 py-4 text-sm shadow-sm transition ${
                          checked
                            ? 'border-sky-500/70 bg-sky-50 ring-1 ring-sky-200 dark:border-sky-400/60 dark:bg-slate-900 dark:ring-sky-500/20'
                            : 'border-slate-200 bg-white hover:border-slate-300 hover:shadow-md dark:border-slate-700 dark:bg-slate-950 dark:hover:border-slate-500/70'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(event) => {
                            setEditPermissions((current) =>
                              event.target.checked
                                ? [...current, permission.key]
                                : current.filter((item) => item !== permission.key)
                            )
                          }}
                          className="mt-1 h-4 w-4 shrink-0 rounded border-slate-300 text-sky-600"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block wrap-break-word text-[13px] font-semibold leading-snug text-slate-900 dark:text-slate-100">
                            {permission.label}
                          </span>
                          <span className="mt-1 block break-words text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                            {permission.desc}
                          </span>
                        </span>
                      </label>
                    )
                  })}
                  {editErrors.permissions ? (
                    <p className="text-xs text-rose-600 md:col-span-2 xl:col-span-3">
                      {editErrors.permissions}
                    </p>
                  ) : null}
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-slate-200 bg-white px-3 py-2 text-xs text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">
                  Права соответствуют выбранной роли. Для кастомизации включите ручной режим.
                </div>
              )}

              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={onSaveUser}
                    disabled={savingUser}
                    className="inline-flex items-center gap-2 rounded-xl bg-sky-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-sky-500 disabled:opacity-60"
                  >
                    Сохранить
                  </button>
                  <button
                    type="button"
                    onClick={() => setPasswordOpen(true)}
                    className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200"
                  >
                    Сменить пароль
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => setProfileOpen(false)}
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200"
                >
                  Закрыть
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

function ProtectedRoute({ token, children }: { token: string | null; children: React.ReactNode }) {
  const location = useLocation()
  if (!token) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }
  return <>{children}</>
}

export default function App() {
  const { user, token, login, logout } = useAuthState()

  useEffect(() => {
    if (!token) return
    // Register player_id on app mount (if already logged in) and on subscription changes
    void registerOneSignalPlayerId()
    const handler = () => void registerOneSignalPlayerId()
    try {
      OneSignal.User?.PushSubscription?.addEventListener?.('change', handler)
    } catch { /* not critical */ }
    return () => {
      try {
        OneSignal.User?.PushSubscription?.removeEventListener?.('change', handler)
      } catch { /* not critical */ }
    }
  }, [token])

  return (
    <Routes>
      <Route path="/login" element={<LoginPage onLogin={login} token={token} />} />
      <Route path="/register" element={<RegisterPage user={user} />} />
      <Route
        path="/settings"
        element={
          <ProtectedRoute token={token}>
            {user ? <SettingsPage user={user} onLogout={logout} /> : null}
          </ProtectedRoute>
        }
      />
      <Route
        path="/"
        element={
          <ProtectedRoute token={token}>
            {user ? <BoardsPage user={user} onLogout={logout} /> : null}
          </ProtectedRoute>
        }
      />
      <Route
        path="/boards/:id"
        element={
          <ProtectedRoute token={token}>
            {user ? <BoardPage onLogout={logout} user={user} /> : null}
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
