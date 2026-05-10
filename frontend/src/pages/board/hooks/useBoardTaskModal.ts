import { useEffect, useMemo, useRef, useState } from 'react'
import { api } from '../../../api/client'
import {
  useDeleteCard,
  useDeleteCardAttachment,
  useUpdateCard,
  useUploadCardAttachments,
} from '../../../api/queries/cards'
import type { Card, CardDeadlineReminder, CardDeadlineReminderResponse } from '../../../api/types'
import { ensureProfileTimeZoneInitialized, formatIsoForTimeZone, getDeviceTimeZone, resolveTimeZone, zonedDateTimeLocalToIso } from '../../../shared/lib/timezone'
import type { AssigneeOption, BoardCardDraft, BoardPriority } from '../types'
import { priorityToMarker } from '../lib/priority'

interface UseBoardTaskModalOptions {
  boardId: number
  assignees: AssigneeOption[]
  allKnownTags: string[]
  allKnownCategories: string[]
}

export function useBoardTaskModal(options: UseBoardTaskModalOptions) {
  const { boardId, assignees, allKnownTags, allKnownCategories } = options
  const updateCardMutation = useUpdateCard(boardId)
  const deleteCardMutation = useDeleteCard(boardId)
  const uploadAttachmentsMutation = useUploadCardAttachments(boardId)
  const deleteAttachmentMutation = useDeleteCardAttachment(boardId)

  const [selectedCard, setSelectedCard] = useState<Card | null>(null)
  const [draft, setDraft] = useState<BoardCardDraft | null>(null)
  const draftBaseRef = useRef<BoardCardDraft | null>(null)
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

    const base: BoardCardDraft = {
      title: selectedCard.title || '',
      description: selectedCard.description || '',
      assignee: selectedCard.assignee ?? null,
      deadline: selectedCard.deadline ? isoToDatetimeLocal(selectedCard.deadline) : '',
      priority: (selectedCard.priority ?? 2) as BoardPriority,
      tags: selectedCard.tags ?? [],
      categories: selectedCard.categories ?? [],
      checklist: selectedCard.checklist ?? [],
      attachments: selectedCard.attachments ?? [],
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
  const selectedPriority: BoardPriority | '' = draft?.priority ?? ''

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
    setSelectedCard((prev) => (prev?.id === updated.id ? updated : prev))
  }

  const persistSelectedCard = async (
    patch: Partial<{
      column: number
      title: string
      description: string
      assignee: number | null
      deadline: string | null
      priority: BoardPriority
      tags: string[]
      categories: string[]
      checklist: { id: string; text: string; done: boolean }[]
      attachments: Card['attachments']
    }>
  ) => {
    if (!selectedCardId) return
    const updated = await updateCardMutation.mutateAsync({ id: selectedCardId, payload: patch })
    applyCardUpdate(updated)
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

  const buildCardUpdateChanges = (base: BoardCardDraft, next: BoardCardDraft) => {
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
      changes.push(`Приоритет: ${priorityToMarker(next.priority)}`)
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
      await deleteCardMutation.mutateAsync(cardId)
      setSelectedCard(null)

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

  const saveReminder = async () => {
    if (!selectedCardId) return false
    if (reminderSaving) return false
    setReminderSaving(true)
    setReminderError('')
    setReminderFieldError('')
    try {
      const availableCount = reminderData?.channels ? Object.values(reminderData.channels).filter((c) => c.available).length : 0
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
      priority: BoardPriority
      tags: string[]
      categories: string[]
      checklist: { id: string; text: string; done: boolean }[]
      attachments: Card['attachments']
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
    const reminderChanged = reminderData ? JSON.stringify(reminderDrafts) !== JSON.stringify(reminderData.reminders) : reminderDrafts.length > 0

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
        const uploaded = await uploadAttachmentsMutation.mutateAsync({
          id: selectedCardId,
          files: pendingUploadFiles,
        })
        updated = uploaded
        applyCardUpdate(uploaded)
        setPendingUploadFiles([])
      }

      for (const attachmentId of pendingDeleteAttachmentIds) {
        const deleted = await deleteAttachmentMutation.mutateAsync({
          id: selectedCardId,
          attachmentId,
        })
        updated = deleted
        applyCardUpdate(deleted)
      }
      setPendingDeleteAttachmentIds([])

      const finalCard = updated ?? selectedCard
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

  return {
    selectedCard,
    setSelectedCard,
    draft,
    setDraft,
    saveBusy,
    deleteBusy,
    modalError,
    reminderDrafts,
    reminderData,
    reminderLoading,
    reminderError,
    reminderFieldError,
    newReminderValue,
    setNewReminderValue,
    newReminderUnit,
    setNewReminderUnit,
    applyReminderValue,
    applyReminderUnit,
    applyReminderChannel,
    toggleReminder,
    addReminderInterval,
    removeReminderInterval,
    selectedChecklist,
    newChecklistItem,
    setNewChecklistItem,
    addChecklistItem,
    toggleChecklistItem,
    removeChecklistItem,
    selectedAttachments,
    newAttachmentType,
    setNewAttachmentType,
    attachmentFileInputKey,
    attachmentFileInputRef,
    setNewAttachmentFiles,
    newAttachmentFiles,
    newAttachmentName,
    setNewAttachmentName,
    newAttachmentUrl,
    setNewAttachmentUrl,
    addAttachment,
    removeAttachment,
    selectedCardId,
    profileTimeZone,
    scheduleDeadlineSave,
    selectedPriority,
    allKnownTags,
    selectedTags,
    newTag,
    setNewTag,
    addTagValue,
    removeTag,
    addTag,
    allKnownCategories,
    selectedCategories,
    newCategory,
    setNewCategory,
    addCategoryValue,
    removeCategory,
    addCategory,
    onSaveCard,
    deleteSelectedCard,
    toast,
    setToast,
    toastSending,
    retryToast,
  }
}
