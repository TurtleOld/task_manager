import { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { api } from '../../../api/client'
import {
  useAddCardAttachment,
  useDeleteCard,
  useDeleteCardAttachment,
  useUpdateCard,
  useUploadCardAttachments,
} from '../../../api/queries/cards'
import type { Card } from '../../../api/types'
import { ensureProfileTimeZoneInitialized, getDeviceTimeZone, resolveTimeZone } from '../../../shared/lib/timezone'
import type { AssigneeOption, BoardCardDraft, BoardLabel, BoardPriority } from '../types'
import { priorityToMarker } from '../lib/priority'
import { useCardDraft } from './useCardDraft'
import { useCardReminders } from './useCardReminders'
import { useCardAttachments } from './useCardAttachments'
import { useCardLabels } from './useCardLabels'
import { useCardChecklist } from './useCardChecklist'
import { useCardSubtasks } from './useCardSubtasks'
import { useCardRecurrence } from './useCardRecurrence'
import { useCardComments } from './useCardComments'
import { useCardActivity } from './useCardActivity'

interface UseBoardTaskModalOptions {
  boardId: number
  assignees: AssigneeOption[]
  allKnownLabels: BoardLabel[]
}

export function useBoardTaskModal(options: UseBoardTaskModalOptions) {
  const { boardId, assignees, allKnownLabels } = options
  const updateCardMutation = useUpdateCard(boardId)
  const deleteCardMutation = useDeleteCard(boardId)
  const uploadAttachmentsMutation = useUploadCardAttachments(boardId)
  const addAttachmentMutation = useAddCardAttachment(boardId)
  const deleteAttachmentMutation = useDeleteCardAttachment(boardId)

  const [selectedCard, setSelectedCard] = useState<Card | null>(null)
  const [saveBusy, setSaveBusy] = useState(false)
  const saveBusyRef = useRef(false)
  const [deleteBusy, setDeleteBusy] = useState(false)
  const [modalError, setModalError] = useState('')
  const deviceTimeZone = useMemo(() => getDeviceTimeZone(), [])
  const [profileTimeZone, setProfileTimeZone] = useState(deviceTimeZone)
  const selectedCardId = selectedCard?.id ?? null
  const selectedCardIsPending = selectedCardId != null && selectedCardId < 0

  const {
    draft,
    setDraft,
    draftBaseRef,
    scheduleDeadlineSave,
    clearDeadlineSave,
    datetimeLocalToIso,
  } = useCardDraft(selectedCard, profileTimeZone)

  const {
    reminderData,
    reminderDrafts,
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
    saveReminder,
    formatReminder,
  } = useCardReminders(selectedCardId, selectedCardIsPending)

  const {
    pendingUploadFiles,
    setPendingUploadFiles,
    pendingUploadType,
    setPendingUploadType,
    pendingCreateAttachments,
    setPendingCreateAttachments,
    pendingDeleteAttachmentIds,
    setPendingDeleteAttachmentIds,
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
  } = useCardAttachments({ selectedCardId, draft, setDraft })

  const {
    selectedLabels,
    newLabel,
    setNewLabel,
    addLabelValue,
    removeLabel,
    addLabel,
  } = useCardLabels({ selectedCardId, draft, setDraft, allKnownLabels })

  const {
    selectedChecklist,
    newChecklistItem,
    setNewChecklistItem,
    addChecklistItem,
    toggleChecklistItem,
    removeChecklistItem,
  } = useCardChecklist({ selectedCardId, draft, setDraft })

  const {
    selectedSubtasks,
    newSubtaskTitle,
    setNewSubtaskTitle,
    subtaskBusy,
    addSubtask,
  } = useCardSubtasks({ selectedCardId, draft, setDraft, profileTimeZone })

  const {
    recurrenceRule,
    recurrenceDraft,
    setRecurrenceDraft,
    recurrencePreset,
    recurrenceLoading,
    recurrenceBusy,
    recurrenceError,
    applyRecurrencePreset,
    saveRecurrence,
  } = useCardRecurrence({ selectedCardId, selectedCardIsPending, cardDeadline: draft?.deadline ?? '' })

  const {
    comments,
    newComment,
    setNewComment,
    editingCommentId,
    editingCommentText,
    setEditingCommentText,
    commentsLoading,
    commentsBusy,
    commentsError,
    addComment,
    startEditComment,
    cancelEditComment,
    saveEditedComment,
    deleteComment,
  } = useCardComments({ selectedCardId, selectedCardIsPending })

  const {
    activities,
    activityLoading,
    activityError,
    reloadActivity,
  } = useCardActivity({ selectedCardId, selectedCardIsPending })

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
    setModalError('')
    setSaveBusy(false)
    saveBusyRef.current = false
    setDeleteBusy(false)
  }, [selectedCard?.id])

  const selectedAttachments = draft?.attachments ?? []
  const selectedPriority: BoardPriority | '' = draft?.priority ?? ''

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
      labels: BoardLabel[]
    }>
  ) => {
    if (!selectedCardId) return
    const updated = await updateCardMutation.mutateAsync({ id: selectedCardId, payload: patch })
    applyCardUpdate(updated)
    return updated
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

    const baseLabelNames = base.labels.map((label) => label.name)
    const nextLabelNames = next.labels.map((label) => label.name)
    if (!sameJson(nextLabelNames, baseLabelNames)) {
      if (nextLabelNames.length > 0) {
        changes.push(`Лейблы: ${nextLabelNames.join(', ')}`)
        changesMeta.labels = nextLabelNames
      } else {
        changes.push('Лейблы удалены')
        changesMeta.labels = []
      }
    }

    // Checklist changes are persisted immediately via dedicated endpoints — we only
    // track them here for the notification summary.
    if (!sameJson(next.checklist, base.checklist)) {
      const baseIds = new Set(base.checklist.map((item) => item.id))
      const nextIds = new Set(next.checklist.map((item) => item.id))
      const added = next.checklist.filter((item) => !baseIds.has(item.id))
      const removed = base.checklist.filter((item) => !nextIds.has(item.id))
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

  const deleteSelectedCard = async () => {
    const cardId = selectedCard?.id
    if (!cardId) return false
    if (deleteBusy || saveBusy) return false
    const title = selectedCard?.title || 'задачу'
    if (!window.confirm(`Архивировать ${title}?`)) return false

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
        toast.error('Задача архивирована, но уведомление отправить не удалось.', {
          action: {
            label: 'Повторить',
            onClick: () => void api.notifyCardDeleted(meta).catch(() => null),
          },
        })
      }
      return true
    } catch (e) {
      setModalError((e as Error).message)
      return false
    } finally {
      setDeleteBusy(false)
    }
  }

  const onSaveCard = async () => {
    if (!selectedCardId || !selectedCard || !draft || !draftBaseRef.current) return false
    if (saveBusyRef.current) return false
    saveBusyRef.current = true
    setSaveBusy(true)
    setModalError('')

    clearDeadlineSave()

    const base = draftBaseRef.current
    const sameJson = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)
    const patch: Partial<{
      title: string
      description: string
      assignee: number | null
      deadline: string | null
      priority: BoardPriority
      labels: BoardLabel[]
    }> = {}

    const nextTitle = draft.title.trim()
    if (!nextTitle) {
      setModalError('Заголовок не может быть пустым')
      setSaveBusy(false)
      saveBusyRef.current = false
      return false
    }

    if (nextTitle !== base.title) patch.title = nextTitle
    if (draft.description !== base.description) patch.description = draft.description
    if (draft.assignee !== base.assignee) patch.assignee = draft.assignee
    if (draft.deadline !== base.deadline) patch.deadline = draft.deadline ? datetimeLocalToIso(draft.deadline) : null
    if (draft.priority !== base.priority) patch.priority = draft.priority
    if (!sameJson(draft.labels, base.labels)) patch.labels = draft.labels
    const hasPatch = Object.keys(patch).length > 0
    const hasAttachmentOps = pendingUploadFiles.length > 0 || pendingCreateAttachments.length > 0 || pendingDeleteAttachmentIds.length > 0
    const reminderChanged = reminderData ? JSON.stringify(reminderDrafts) !== JSON.stringify(reminderData.reminders) : reminderDrafts.length > 0
    const recurrenceChanged = recurrenceRule
      ? JSON.stringify(recurrenceDraft) !== JSON.stringify({
        freq: recurrenceRule.freq,
        interval: recurrenceRule.interval,
        byweekday: recurrenceRule.byweekday,
        byday: recurrenceRule.byday,
        bysetpos: recurrenceRule.bysetpos,
        until: recurrenceRule.until,
        count: recurrenceRule.count,
      }) || recurrencePreset === 'none'
      : recurrencePreset !== 'none'

    if (!hasPatch && !hasAttachmentOps && !reminderChanged && !recurrenceChanged) {
      setSelectedCard(null)
      setSaveBusy(false)
      saveBusyRef.current = false
      return true
    }

    try {
      let updated: Card | undefined

      const deleteRecurrenceFirst = recurrenceChanged && recurrencePreset === 'none'

      if (deleteRecurrenceFirst) {
        const recurrenceOk = await saveRecurrence()
        if (!recurrenceOk) {
          setSaveBusy(false)
          saveBusyRef.current = false
          return false
        }
      }

      if (hasPatch) {
        updated = await persistSelectedCard(patch)
      }

      if (reminderChanged) {
        const reminderOk = await saveReminder()
        if (!reminderOk) {
          setSaveBusy(false)
          saveBusyRef.current = false
          return false
        }
      }

      if (recurrenceChanged && !deleteRecurrenceFirst) {
        const recurrenceOk = await saveRecurrence()
        if (!recurrenceOk) {
          setSaveBusy(false)
          saveBusyRef.current = false
          return false
        }
      }

      if (pendingUploadFiles.length > 0) {
        const uploaded = await uploadAttachmentsMutation.mutateAsync({
          id: selectedCardId,
          files: pendingUploadFiles,
          type: pendingUploadType,
        })
        updated = uploaded
        applyCardUpdate(uploaded)
        setPendingUploadFiles([])
        setPendingUploadType('file')
      }

      for (const attachment of pendingCreateAttachments) {
        const created = await addAttachmentMutation.mutateAsync({
          id: selectedCardId,
          payload: {
            name: attachment.name,
            type: attachment.type,
            url: attachment.url,
          },
        })
        updated = created
        applyCardUpdate(created)
      }
      setPendingCreateAttachments([])

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
          labels: draft.labels,
          checklist: draft.checklist,
          subtasks: draft.subtasks,
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

        if (recurrenceChanged) {
          changes.push(recurrencePreset === 'none' ? 'Повторение отключено' : 'Повторение обновлено')
          changesMeta.recurrence = recurrencePreset
        }

        await api.notifyCardUpdated(finalCard.id, {
          version: finalCard.version,
          description: draft.description.trim() || undefined,
          changes,
          changes_meta: changesMeta,
        })
      } catch {
        const cardId = finalCard.id
        const version = finalCard.version
        toast.error('Изменения сохранены, но уведомление отправить не удалось.', {
          action: {
            label: 'Повторить',
            onClick: () => void api.notifyCardUpdated(cardId, { version }).catch(() => null),
          },
        })
      }
      return true
    } catch (e) {
      setModalError((e as Error).message)
      return false
    } finally {
      setSaveBusy(false)
      saveBusyRef.current = false
    }
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
    selectedSubtasks,
    newSubtaskTitle,
    setNewSubtaskTitle,
    subtaskBusy,
    addSubtask,
    recurrenceRule,
    recurrenceDraft,
    setRecurrenceDraft,
    recurrencePreset,
    recurrenceLoading,
    recurrenceBusy,
    recurrenceError,
    applyRecurrencePreset,
    comments,
    newComment,
    setNewComment,
    editingCommentId,
    editingCommentText,
    setEditingCommentText,
    commentsLoading,
    commentsBusy,
    commentsError,
    addComment,
    startEditComment,
    cancelEditComment,
    saveEditedComment,
    deleteComment,
    activities,
    activityLoading,
    activityError,
    reloadActivity,
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
    allKnownLabels,
    selectedLabels,
    newLabel,
    setNewLabel,
    addLabelValue,
    removeLabel,
    addLabel,
    onSaveCard,
    deleteSelectedCard,
  }
}
