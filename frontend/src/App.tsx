import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, Navigate, Route, Routes, useParams } from 'react-router-dom'
import OneSignal from 'react-onesignal'
import { api } from './api/client'
import { ProtectedRoute } from './app/ProtectedRoute'
import { AUTH_TOKEN_KEY, registerOneSignalPlayerId } from './app/auth'
import { toggleTheme } from './app/theme'
import { LoginPage } from './pages/auth/LoginPage'
import { RegisterPage } from './pages/auth/RegisterPage'
import { BoardsPage } from './pages/boards/BoardsPage'
import { SettingsPage } from './pages/settings/SettingsPage'
import {
  Badge,
  Button,
  Card as SurfaceCard,
  Checkbox,
  Chip,
  ChipButton,
  EmptyState,
  Field,
  IconButton,
  Modal,
  RadioCard,
  Select,
  Textarea,
  TextInput,
  Toast,
} from './shared/ui'
import {
  ensureProfileTimeZoneInitialized,
  formatIsoForTimeZone,
  getDeviceTimeZone,
  getTimeZoneLabel,
  resolveTimeZone,
  zonedDateTimeLocalToIso,
} from './shared/lib/timezone'
import { useAuthState } from './shared/hooks/useAuthState'
import { useBoardWebSocket } from './useBoardWebSocket'
import type { BoardEvent } from './useBoardWebSocket'
import type {
  AuthUser,
  Column,
  Card,
  CardDeadlineReminderResponse,
  CardDeadlineReminder,
} from './api/types'

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
  const [searchQuery, setSearchQuery] = useState('')
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
  const deviceTimeZone = useMemo(() => getDeviceTimeZone(), [])
  const [profileTimeZone, setProfileTimeZone] = useState(deviceTimeZone)

  // ---- datetime helpers ----
  // Backend stores datetimes as ISO strings. The card modal uses <input type="datetime-local" />.
  // We normalize UI state to the datetime-local format: YYYY-MM-DDTHH:mm (local time).
  const isoToDatetimeLocal = (value: string) => formatIsoForTimeZone(value, profileTimeZone)

  const datetimeLocalToIso = (value: string) => zonedDateTimeLocalToIso(value, profileTimeZone)

  useEffect(() => {
    let mounted = true
    ;(async () => {
      try {
        const profile = await api.getNotificationProfile()
        const nextProfile = await ensureProfileTimeZoneInitialized(profile, deviceTimeZone)
        if (!mounted) return
        setProfileTimeZone(resolveTimeZone(nextProfile.timezone))
      } catch {
        if (!mounted) return
        setProfileTimeZone(deviceTimeZone)
      }
    })()
    return () => {
      mounted = false
    }
  }, [deviceTimeZone])

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
    if (marker === '🔥') return { label: 'Срочно', marker: '🔥', tone: 'danger' as const }
    if (marker === '🟢') return { label: 'Можно когда будет время', marker: '🟢', tone: 'success' as const }
    return { label: 'Важно (до конца недели)', marker: '🟡', tone: 'warning' as const }
  }

  const formatDateTime = (value: string) => {
    if (!value) return ''
    const parsed = new Date(value)
    if (Number.isNaN(parsed.getTime())) return value
    return parsed.toLocaleString('ru-RU', {
      timeZone: profileTimeZone,
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

  const tagOptions = useMemo(() => ['Все', ...new Set(Object.values(cardTags).flat())], [cardTags])
  const categoryOptions = useMemo(() => ['Все', ...new Set(Object.values(cardCategories).flat())], [cardCategories])

  const tagsFor = (card: Card) => cardTags[card.id] ?? []
  const categoriesFor = (card: Card) => cardCategories[card.id] ?? []
  const deadlineFor = (card: Card) => cardDeadlines[card.id] ?? card.deadline ?? ''
  const priorityMarkerFor = (card: Card) => cardPriorities[card.id] ?? '🟡'

  const filteredCards = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()

    return cards.filter((card) => {
      const tags = cardTags[card.id] ?? []
      const categories = cardCategories[card.id] ?? []
      const matchesTag = activeTag === 'Все' || tags.includes(activeTag)
      const matchesCategory = activeCategory === 'Все' || categories.includes(activeCategory)
      const searchable = [card.title, card.description, ...tags, ...categories].join(' ').toLowerCase()
      const matchesSearch = !query || searchable.includes(query)
      return matchesTag && matchesCategory && matchesSearch
    })
  }, [activeCategory, activeTag, cardCategories, cardTags, cards, searchQuery])

  const grouped = useMemo(() => {
    const g: Record<number, Card[]> = {}
    for (const c of filteredCards) {
      g[c.column] = g[c.column] ?? []
      g[c.column]?.push(c)
    }
    for (const k of Object.keys(g)) {
      g[Number(k)]?.sort((a, b) => {
        const createdDiff = Date.parse(b.created_at) - Date.parse(a.created_at)
        return createdDiff || b.id - a.id
      })
    }
    return g
  }, [filteredCards])

  const allKnownTags = tagOptions.filter((t) => t !== 'Все')
  const allKnownCategories = categoryOptions.filter((c) => c !== 'Все')
  const urgentCardsCount = cards.filter((card) => priorityMarkerFor(card) === '🔥').length
  const datedCardsCount = cards.filter((card) => Boolean(deadlineFor(card))).length
  const activeFilterCount = [activeTag !== 'Все', activeCategory !== 'Все', Boolean(searchQuery.trim())].filter(Boolean).length

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
    'text-primary',
    'text-warning',
    'text-success',
    'text-danger',
    'text-secondary',
    'text-accent',
  ]
  const accentForColumn = (index: number) => accentClasses[index % accentClasses.length]

  return (
    <div className="min-h-screen bg-background pb-12 text-text">
      <header className="sticky top-0 z-sticky border-b border-border bg-surface/90 px-4 py-5 shadow-surface backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <nav className="flex items-center gap-2 text-body-sm text-text-muted" aria-label="Навигация по доскам">
              <Link to="/" className="hover:text-primary">Все доски</Link>
              <span aria-hidden="true">/</span>
              <span>{boardName}</span>
            </nav>
            <h1 className="mt-2 text-h1 text-text">{boardName || 'Доска'}</h1>
            <p className="text-body-sm text-text-muted">Перетаскивайте задачи, фильтруйте поток и открывайте детали без потери контекста.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={() => setIsCreatingColumn(true)} variant="secondary" aria-label="Создать колонку">
              <span aria-hidden="true">+</span>
              Новая колонка
            </Button>
            <Button onClick={onLogout} variant="danger" aria-label="Выйти">
              Выйти
            </Button>
            <Button type="button" variant="secondary" onClick={toggleTheme} aria-label="Переключить тему">
              Тема
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl space-y-6 px-4 pt-6">
        <section className="grid gap-3 sm:grid-cols-3" aria-label="Сводка по доске">
          <SurfaceCard className="p-4">
            <p className="text-caption uppercase text-text-muted">Всего задач</p>
            <p className="mt-1 text-h2 text-text">{cards.length}</p>
          </SurfaceCard>
          <SurfaceCard className="p-4">
            <p className="text-caption uppercase text-text-muted">С дедлайном</p>
            <p className="mt-1 text-h2 text-info">{datedCardsCount}</p>
          </SurfaceCard>
          <SurfaceCard className="p-4">
            <p className="text-caption uppercase text-text-muted">Срочные</p>
            <p className="mt-1 text-h2 text-danger">{urgentCardsCount}</p>
          </SurfaceCard>
        </section>

        {isCreatingColumn ? (
          <SurfaceCard as="section" className="p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <Field label="Название колонки" htmlFor="new-column-name" className="flex-1">
                <TextInput
                  id="new-column-name"
                  value={colName}
                  onChange={(e) => setColName(e.target.value)}
                  placeholder="Введите название"
                />
              </Field>
              <Field label="Иконка" htmlFor="new-column-icon">
                <Select id="new-column-icon" value={colIcon} onChange={(e) => setColIcon(e.target.value)} aria-label="Выбор иконки колонки">
                  {availableIcons.map((icon) => (
                    <option key={icon} value={icon}>{icon}</option>
                  ))}
                </Select>
              </Field>
              <div className="flex min-h-11 items-center gap-2">
                <Button onClick={onCreateColumn} aria-label="Добавить колонку">Добавить</Button>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    setIsCreatingColumn(false)
                    setColName('')
                  }}
                  aria-label="Отменить создание колонки"
                >
                  Отмена
                </Button>
              </div>
            </div>
          </SurfaceCard>
        ) : null}

        <SurfaceCard as="section">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <h2 className="text-h3 text-text">Поиск и фильтры</h2>
              <p className="mt-1 text-body-sm text-text-muted">Быстро находите задачи по названию, описанию, тегам и категориям.</p>
            </div>
            <Badge variant={activeFilterCount ? 'primary' : 'neutral'}>
              Активных фильтров: {activeFilterCount}
            </Badge>
          </div>
          <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_1fr]">
            <Field label="Поиск" htmlFor="board-task-search" className="lg:col-span-2">
              <TextInput
                id="board-task-search"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Название, описание, тег или категория"
              />
            </Field>
            <div>
              <p className="text-label uppercase text-text-muted">Теги</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {tagOptions.map((tag) => (
                  <ChipButton key={tag} active={activeTag === tag} tone="primary" onClick={() => setActiveTag(tag)}>
                    {tag}
                  </ChipButton>
                ))}
              </div>
            </div>
            <div>
              <p className="text-label uppercase text-text-muted">Категории</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {categoryOptions.map((category) => (
                  <ChipButton key={category} active={activeCategory === category} tone="success" onClick={() => setActiveCategory(category)}>
                    {category}
                  </ChipButton>
                ))}
              </div>
            </div>
          </div>
        </SurfaceCard>

        <section className="grid gap-5 lg:grid-cols-3" aria-label="Колонки канбан-доски">
          {sortedColumns.map((col, index) => {
            const displayName = col.name?.trim() ? col.name : ''
            const displayIcon = col.icon?.trim() ? col.icon : ''
            const accent = accentForColumn(index)
            return (
              <div
                key={col.id}
                className="flex h-full flex-col rounded-panel border border-border bg-surface-elevated/80 p-4 shadow-surface backdrop-blur transition-colors duration-fast ease-standard"
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
                      <h2 className={`text-h3 ${accent}`}>{displayName}</h2>
                    </div>
                  </div>
                  <Badge>
                    {(grouped[col.id] || []).length} задач
                  </Badge>
                </div>

                <div className="mt-4 flex items-center gap-2">
                  <label className="flex-1">
                    <span className="sr-only">Новая карточка</span>
                    <TextInput
                      placeholder="Название задачи"
                      value={newCardTitle[col.id] || ''}
                      onChange={(e) => setNewCardTitle((s) => ({ ...s, [col.id]: e.target.value }))}
                    />
                  </label>
                  <IconButton
                    onClick={() => onCreateCard(col.id)}
                    variant="primary"
                    aria-label={`Добавить карточку в ${displayName || 'колонку'}`}
                  >
                    +
                  </IconButton>
                </div>

                <ul className="mt-4 space-y-4" aria-label={`Карточки ${displayName || 'колонки'}`}>
                  {(grouped[col.id] || []).length === 0 ? (
                    <li>
                      <EmptyState title="Нет задач" className="p-4 text-left">
                        Создайте первую задачу в этой колонке.
                      </EmptyState>
                    </li>
                  ) : null}
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
                        className="group rounded-panel border border-border bg-surface p-4 shadow-surface transition duration-fast ease-standard hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-elevated"
                        draggable
                        onDragStart={() => setDragged(card)}
                        onDragEnd={() => setDragged(null)}
                      >
                        <button
                          type="button"
                          onClick={() => setSelectedCard(card)}
                          className="block w-full rounded-control text-left"
                          aria-label={`Открыть задачу ${card.title}`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <h3 className="text-body-sm font-semibold text-text">
                                {card.title}
                              </h3>
                              <p className="mt-2 line-clamp-3 text-caption text-text-muted">
                                {card.description}
                              </p>
                            </div>
                            <Chip tone={priority.tone} active>
                              {priority.marker} {priority.label}
                            </Chip>
                          </div>

                          <div className="mt-3 flex flex-wrap gap-2">
                            {tags.map((tag) => (
                              <Chip key={tag} tone="primary">
                                {tag}
                              </Chip>
                            ))}
                            {categories.map((category) => (
                              <Chip key={category} tone="success">
                                {category}
                              </Chip>
                            ))}
                          </div>

                          {deadline && (
                            <div className="mt-3 flex flex-wrap gap-2">
                              {deadline ? (
                                <Chip tone="warning">
                                  ⏰ {formatDateTime(deadline)}
                                </Chip>
                              ) : null}
                            </div>
                          )}

                          {assigneeName && (
                            <div className="mt-3 flex items-center gap-1.5 text-caption text-text-muted">
                              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-caption font-bold text-primary">
                                {assigneeName[0]?.toUpperCase()}
                              </span>
                              <span>{assigneeName}</span>
                            </div>
                          )}
                        </button>

                        <div className="mt-3 flex items-center justify-between text-caption text-text-muted">
                          <span className="inline-flex items-center gap-1">
                            <span className="h-1.5 w-1.5 rounded-full bg-success" aria-hidden="true" />
                            {formatUpdatedStatus(card.updated_at)}
                          </span>
                          <div className="flex items-center gap-1 md:hidden">
                            <IconButton
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
                              className="min-h-8 min-w-8"
                              aria-label="Поднять карточку"
                            >
                              ↑
                            </IconButton>
                            <IconButton
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
                              className="min-h-8 min-w-8"
                              aria-label="Опустить карточку"
                            >
                              ↓
                            </IconButton>
                            <IconButton
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
                              className="min-h-8 min-w-8"
                              aria-label="Переместить влево"
                            >
                              ←
                            </IconButton>
                            <IconButton
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
                              className="min-h-8 min-w-8"
                              aria-label="Переместить вправо"
                            >
                              →
                            </IconButton>
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
        <Modal
          open={Boolean(selectedCard && draft)}
          onClose={() => {
            if (!saveBusy && !deleteBusy) setSelectedCard(null)
          }}
          title={selectedCard.title || 'Редактирование задачи'}
          className="max-h-[calc(100vh-2rem)] max-w-5xl overflow-y-auto"
        >
            <div className="flex flex-col gap-3 rounded-panel border border-border bg-background-subtle p-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-label uppercase text-text-muted">Редактирование задачи</p>
                <p className="text-caption text-text-muted">Сохранение, дедлайн, участники и контекст задачи в одном месте.</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button type="button" onClick={() => void onSaveCard()} loading={saveBusy} disabled={deleteBusy}>
                  Сохранить
                </Button>
                <Button type="button" variant="danger" onClick={() => void deleteSelectedCard()} loading={deleteBusy} disabled={saveBusy}>
                  Удалить задачу
                </Button>
                <Button type="button" variant="secondary" onClick={() => setSelectedCard(null)} disabled={saveBusy || deleteBusy}>
                  Закрыть
                </Button>
              </div>
            </div>

            {modalError ? <p className="mt-3 text-body-sm text-danger" role="alert">{modalError}</p> : null}

            <div className="mt-6 grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
              <div className="space-y-5">
                <Field label="Заголовок" htmlFor="task-title">
                  <TextInput
                    id="task-title"
                    value={draft.title}
                    onChange={(event) => setDraft((prev) => (prev ? { ...prev, title: event.target.value } : prev))}
                  />
                </Field>
                <Field label="Подробное описание" htmlFor="task-description">
                  <Textarea
                    id="task-description"
                    rows={4}
                    value={draft.description}
                    onChange={(event) => setDraft((prev) => (prev ? { ...prev, description: event.target.value } : prev))}
                  />
                </Field>
                <SurfaceCard as="section" className="p-4">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-label uppercase text-text-muted">Напоминание о дедлайне</p>
                      <h3 className="text-body-sm font-semibold text-text">
                        {reminderDrafts.length > 0
                          ? `Напоминаний: ${reminderDrafts.filter((item) => item.enabled).length}`
                          : 'Напоминание отключено'}
                      </h3>
                    </div>
                    <Checkbox
                      label="Включено"
                      checked={reminderDrafts.some((item) => item.enabled)}
                      onChange={(event) => {
                        const nextEnabled = event.target.checked
                        setReminderDrafts((prev) => prev.map((item) => ({ ...item, enabled: nextEnabled })))
                      }}
                      disabled={!(reminderData?.deadline || draft?.deadline) || reminderDrafts.length === 0}
                      className="bg-background-subtle"
                    />
                  </div>

                  {reminderLoading ? (
                    <p className="mt-2 text-caption text-text-muted">Загрузка настроек...</p>
                  ) : null}

                  {reminderError ? (
                    <p className="mt-2 text-caption text-danger" role="alert">{reminderError}</p>
                  ) : null}

                  {!reminderData?.deadline && !draft?.deadline ? (
                    <div className="mt-3 rounded-control border border-dashed border-warning/30 bg-warning/10 px-3 py-2 text-caption text-warning">
                      Установите срок выполнения, чтобы настроить напоминание.
                    </div>
                  ) : null}

                  {reminderDrafts.length === 0 && (reminderData?.deadline || draft?.deadline) ? (
                    <div className="mt-3 rounded-control border border-dashed border-border bg-background-subtle px-3 py-2 text-caption text-text-muted">
                      Добавьте один или несколько интервалов напоминания.
                    </div>
                  ) : null}

                  {reminderDrafts.length > 0 && (reminderData?.deadline || draft?.deadline) ? (
                    <div className="mt-3 space-y-3">
                      <div className="space-y-2">
                        <span className="text-label uppercase text-text-muted">Интервалы до дедлайна</span>
                        <div className="space-y-2">
                          {reminderDrafts.map((item) => (
                            <div key={item.id} className="flex flex-wrap items-center gap-2 rounded-control border border-border bg-background-subtle p-2">
                              <TextInput
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
                                fullWidth={false}
                                className="w-24"
                                disabled={!item.enabled}
                              />
                              <Select
                                value={item.offset_unit}
                                onChange={(event) => {
                                  applyReminderUnit(item.id, event.target.value as 'minutes' | 'hours')
                                  setReminderFieldError('')
                                }}
                                fullWidth={false}
                                className="w-28"
                                disabled={!item.enabled}
                              >
                                <option value="minutes">минут</option>
                                <option value="hours">часов</option>
                              </Select>
                              <Checkbox
                                label="Активно"
                                checked={item.enabled}
                                onChange={(event) => toggleReminder(item.id, event.target.checked)}
                                className="border-transparent bg-transparent px-2 shadow-none"
                              />
                              <Button type="button" variant="danger" size="sm" onClick={() => removeReminderInterval(item.id)}>
                                Удалить
                              </Button>
                            </div>
                          ))}
                        </div>
                          <div className="flex flex-wrap items-center gap-2 rounded-control border border-dashed border-border bg-background-subtle p-2">
                            <TextInput
                              type="number"
                              min={1}
                              max={newReminderUnit === 'hours' ? 168 : 1440}
                              step={1}
                              value={newReminderValue}
                              onChange={(event) => setNewReminderValue(Number(event.target.value) || 1)}
                              fullWidth={false}
                              className="w-24"
                            />
                            <Select
                              value={newReminderUnit}
                              onChange={(event) => setNewReminderUnit(event.target.value as 'minutes' | 'hours')}
                              fullWidth={false}
                              className="w-28"
                            >
                              <option value="minutes">минут</option>
                              <option value="hours">часов</option>
                            </Select>
                            <Button
                              type="button"
                              onClick={() => addReminderInterval(newReminderValue, newReminderUnit)}
                              disabled={!(reminderData?.deadline || draft?.deadline)}
                              variant="secondary"
                              size="sm"
                            >
                              Добавить интервал
                            </Button>
                          </div>
                        <div className="flex items-center gap-2 text-caption text-text-muted">
                          Изменения сохраняются вместе с общей кнопкой “Сохранить”.
                        </div>
                      </div>

                      <div className="rounded-control border border-border bg-background-subtle p-3 text-caption text-text-muted">
                        <p className="font-semibold text-text">Канал доставки</p>
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
                              <RadioCard
                                key={channel}
                                name="reminder-channel"
                                value={channel}
                                checked={reminderDrafts.every((item) => item.channel === channel) || isAuto}
                                onChange={() => applyReminderChannel(channel)}
                                disabled={!available}
                                label={channel === 'email' ? 'Email' : 'Telegram'}
                                description={!available ? info?.reason || 'Недоступен' : isAuto ? 'Единственный доступный канал' : undefined}
                                className={!available ? 'border-danger/25 bg-danger/10' : undefined}
                              />
                            )
                          })}
                        </div>
                        {reminderFieldError ? (
                          <p className="mt-2 text-caption text-danger" role="alert">{reminderFieldError}</p>
                        ) : null}
                      </div>

                      {reminderDrafts.some((item) => item.status === 'invalid.past') ? (
                        <div className="rounded-control border border-warning/30 bg-warning/10 px-3 py-2 text-caption text-warning">
                          Время напоминания уже прошло. Скорректируйте интервал или срок выполнения.
                        </div>
                      ) : null}
                      {reminderDrafts.some((item) => item.status === 'invalid.channel') ? (
                        <div className="rounded-control border border-danger/30 bg-danger/10 px-3 py-2 text-caption text-danger">
                          Канал доставки недоступен. Проверьте настройки уведомлений.
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </SurfaceCard>
                <SurfaceCard as="section" className="bg-background-subtle p-4 shadow-none">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <h3 className="text-body-sm font-semibold text-text">Чек-лист</h3>
                    <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
                      <TextInput
                        value={newChecklistItem}
                        onChange={(event) => setNewChecklistItem(event.target.value)}
                        placeholder="Добавить пункт"
                        className="sm:w-56"
                      />
                      <Button type="button" onClick={addChecklistItem} size="sm">
                        Добавить
                      </Button>
                    </div>
                  </div>
                  <div className="mt-3 space-y-2 text-body-sm text-text-muted">
                    {selectedChecklist.length === 0 ? (
                      <EmptyState title="Пока нет пунктов" className="p-4">
                        Добавьте первый пункт, чтобы отслеживать прогресс задачи.
                      </EmptyState>
                    ) : (
                      selectedChecklist.map((item) => (
                        <div key={item.id} className="flex items-center justify-between gap-3 rounded-control border border-border bg-surface px-3 py-2">
                          <Checkbox
                            label={<span className={item.done ? 'line-through opacity-70' : ''}>{item.text}</span>}
                            checked={item.done}
                            onChange={() => toggleChecklistItem(item.id)}
                            className="flex-1 border-transparent bg-transparent px-0 py-0 shadow-none"
                          />
                          <Button type="button" variant="danger" size="sm" onClick={() => removeChecklistItem(item.id)}>
                            Удалить
                          </Button>
                        </div>
                      ))
                    )}
                  </div>
                </SurfaceCard>
                <SurfaceCard as="section" className="bg-background-subtle p-4 shadow-none">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <h3 className="text-body-sm font-semibold text-text">Вложения, ссылки, фото</h3>
                    <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
                      <Select
                        value={newAttachmentType}
                        onChange={(event) => setNewAttachmentType(event.target.value as 'file' | 'link' | 'photo')}
                        className="sm:w-28"
                      >
                        <option value="file">Файл</option>
                        <option value="link">Ссылка</option>
                        <option value="photo">Фото</option>
                      </Select>

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
                          <Button
                            type="button"
                            onClick={() => attachmentFileInputRef.current?.click()}
                            variant="secondary"
                            size="sm"
                            className="justify-start sm:w-56"
                          >
                            {newAttachmentFiles.length === 0
                              ? 'Файл не выбран'
                              : newAttachmentFiles.length === 1
                                ? newAttachmentFiles[0]?.name
                                : `Выбрано: ${newAttachmentFiles.length} файла(ов)`}
                          </Button>
                        </>
                      ) : (
                        <>
                          <TextInput
                            value={newAttachmentName}
                            onChange={(event) => setNewAttachmentName(event.target.value)}
                            placeholder="Название"
                            className="sm:w-44"
                          />
                          <TextInput
                            value={newAttachmentUrl}
                            onChange={(event) => setNewAttachmentUrl(event.target.value)}
                            placeholder="URL (необязательно)"
                            className="sm:w-52"
                          />
                        </>
                      )}
                      <Button type="button" onClick={addAttachment} size="sm">
                        Добавить
                      </Button>
                    </div>
                  </div>
                  <div className="mt-3 grid gap-2 text-body-sm text-text-muted">
                    {selectedAttachments.length === 0 ? (
                      <EmptyState title="Вложения отсутствуют" className="p-4">
                        Прикрепите файл или добавьте ссылку к задаче.
                      </EmptyState>
                    ) : (
                      selectedAttachments.map((item) => (
                        <div key={item.id} className="flex items-center justify-between gap-3 rounded-control border border-border bg-surface px-3 py-2">
                          <span className="inline-flex items-center gap-2">
                            {item.type === 'file' ? '📎' : item.type === 'photo' ? '🖼️' : '🔗'} {item.name}
                          </span>
                          <div className="flex items-center gap-2 text-caption">
                            {item.type === 'file' && item.url ? (
                              <a
                                href={item.url}
                                target="_blank"
                                rel="noreferrer"
                                className="font-semibold text-primary hover:text-primary-hover"
                              >
                                Открыть
                              </a>
                            ) : null}
                            {item.type !== 'file' && item.url ? (
                              <a
                                href={item.url}
                                target="_blank"
                                rel="noreferrer"
                                className="font-semibold text-primary hover:text-primary-hover"
                              >
                                Открыть
                              </a>
                            ) : null}
                            <Button type="button" variant="danger" size="sm" onClick={() => void removeAttachment(item)}>
                              Удалить
                            </Button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </SurfaceCard>
              </div>

              <div className="space-y-5">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Ответственный" htmlFor="task-assignee">
                    <Select
                      id="task-assignee"
                      value={draft.assignee ?? ''}
                      onChange={(event) => {
                        if (!selectedCardId) return
                        const next = event.target.value ? Number(event.target.value) : null
                        setDraft((prev) => (prev ? { ...prev, assignee: next } : prev))
                      }}
                    >
                      <option value="">Не назначен</option>
                      {assignees.map((assignee) => (
                        <option key={assignee.id} value={assignee.id}>
                          {assignee.name}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field
                    label="Срок выполнения"
                    htmlFor="task-deadline"
                    hint={`Выберите дату и время завершения задачи в часовом поясе ${getTimeZoneLabel(profileTimeZone)}.`}
                    hintId="task-deadline-hint"
                  >
                    <TextInput
                      id="task-deadline"
                      type="datetime-local"
                      value={draft.deadline}
                      onChange={(event) => {
                        if (!selectedCardId) return
                        const value = event.target.value
                        setDraft((prev) => (prev ? { ...prev, deadline: value } : prev))
                        scheduleDeadlineSave()
                      }}
                      aria-describedby="task-deadline-hint"
                    />
                  </Field>
                </div>

                <SurfaceCard className="bg-background-subtle p-4 shadow-none">
                  <h3 className="text-body-sm font-semibold text-text">Приоритет</h3>
                  <div className="mt-3 grid gap-2">
                    {[
                      { marker: '🔥', label: 'Срочно', description: 'Нужно обработать в первую очередь' },
                      { marker: '🟡', label: 'Важно', description: 'Желательно закрыть до конца недели' },
                      { marker: '🟢', label: 'Можно позже', description: 'Не блокирует текущую работу' },
                    ].map((item) => (
                      <RadioCard
                        key={item.label}
                        name="priority"
                        checked={selectedPriority === item.marker}
                        onChange={() => {
                          if (!selectedCardId) return
                          setDraft((prev) => (prev ? { ...prev, priority: item.marker as '🔥' | '🟡' | '🟢' } : prev))
                        }}
                        label={`${item.marker} ${item.label}`}
                        description={item.description}
                      />
                    ))}
                  </div>
                </SurfaceCard>

                <SurfaceCard as="section" className="p-4">
                  <h3 className="text-body-sm font-semibold text-text">Теги и категории</h3>
                  <div className="mt-3 grid gap-3">
                    <div className="rounded-control border border-dashed border-border bg-background-subtle p-3 text-caption text-text-muted">
                      <p className="font-semibold text-text">Доступные теги</p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {allKnownTags.length === 0 ? (
                          <span>Пока нет тегов в этой доске.</span>
                        ) : (
                          allKnownTags
                            .filter((tag) => !selectedTags.includes(tag))
                            .filter((tag) => (newTag.trim() ? tag.toLowerCase().includes(newTag.trim().toLowerCase()) : true))
                            .map((tag) => (
                              <ChipButton
                                key={tag}
                                onClick={() => addTagValue(tag)}
                                tone="primary"
                              >
                                + {tag}
                              </ChipButton>
                            ))
                        )}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {selectedTags.length === 0 ? (
                        <span className="text-caption text-text-muted">Теги не добавлены.</span>
                      ) : (
                        selectedTags.map((tag) => (
                          <Chip key={tag} tone="primary">
                            {tag}
                            <button
                              type="button"
                              onClick={() => removeTag(tag)}
                              className="text-danger hover:text-danger/80"
                              aria-label={`Удалить тег ${tag}`}
                            >
                              ×
                            </button>
                          </Chip>
                        ))
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <TextInput
                        value={newTag}
                        onChange={(event) => setNewTag(event.target.value)}
                        placeholder="Новый тег"
                      />
                      <Button type="button" onClick={addTag} size="sm">
                        Добавить
                      </Button>
                    </div>

                    <div className="rounded-control border border-dashed border-border bg-background-subtle p-3 text-caption text-text-muted">
                      <p className="font-semibold text-text">Доступные категории</p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {allKnownCategories.length === 0 ? (
                          <span>Пока нет категорий в этой доске.</span>
                        ) : (
                          allKnownCategories
                            .filter((category) => !selectedCategories.includes(category))
                            .filter((category) =>
                              newCategory.trim() ? category.toLowerCase().includes(newCategory.trim().toLowerCase()) : true
                            )
                            .map((category) => (
                              <ChipButton
                                key={category}
                                onClick={() => addCategoryValue(category)}
                                tone="success"
                              >
                                + {category}
                              </ChipButton>
                            ))
                        )}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {selectedCategories.length === 0 ? (
                        <span className="text-caption text-text-muted">Категории не добавлены.</span>
                      ) : (
                        selectedCategories.map((category) => (
                          <Chip key={category} tone="success">
                            {category}
                            <button
                              type="button"
                              onClick={() => removeCategory(category)}
                              className="text-danger hover:text-danger/80"
                              aria-label={`Удалить категорию ${category}`}
                            >
                              ×
                            </button>
                          </Chip>
                        ))
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <TextInput
                        value={newCategory}
                        onChange={(event) => setNewCategory(event.target.value)}
                        placeholder="Новая категория"
                      />
                      <Button type="button" onClick={addCategory} size="sm" variant="secondary">
                        Добавить
                      </Button>
                    </div>
                  </div>
                </SurfaceCard>

              </div>
            </div>
        </Modal>
      ) : null}

      {toast ? (
        <Toast
          tone={toast.tone === 'error' ? 'error' : 'info'}
          onClose={() => setToast(null)}
          action={toast.retry ? { label: 'Повторить', loading: toastSending, onClick: () => void retryToast() } : undefined}
        >
          {toast.message}
        </Toast>
      ) : null}
    </div>
  )
}

export default function App() {
  const { user, token, login, logout, updateUser } = useAuthState()

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
            {user ? <SettingsPage user={user} onLogout={logout} onUserUpdate={updateUser} /> : null}
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
