import type { Dispatch, MutableRefObject, SetStateAction } from 'react'
import type { Card, CardActivity, CardComment, CardDeadlineReminder, CardDeadlineReminderResponse, RecurrenceRule } from '../../../../api/types'
import type { AssigneeOption, BoardAttachment, BoardCardDraft, BoardChecklistItem, BoardLabel, BoardPriority, BoardSubtask } from '../../types'

export interface TaskModalProps {
  selectedCard: Card
  boardName: string
  draft: BoardCardDraft
  saveBusy: boolean
  deleteBusy: boolean
  modalError: string
  onClose: () => void
  onSave: () => void
  onDelete: () => void
  setDraft: Dispatch<SetStateAction<BoardCardDraft | null>>
  reminderDrafts: CardDeadlineReminder[]
  reminderData: CardDeadlineReminderResponse | null
  reminderLoading: boolean
  reminderError: string
  reminderFieldError: string
  newReminderValue: number
  setNewReminderValue: (value: number) => void
  newReminderUnit: 'minutes' | 'hours'
  setNewReminderUnit: (value: 'minutes' | 'hours') => void
  applyReminderValue: (id: number, value: number) => void
  applyReminderUnit: (id: number, unit: 'minutes' | 'hours') => void
  applyReminderChannel: (channel: 'email' | 'telegram' | null) => void
  toggleReminder: (id: number, enabled: boolean) => void
  addReminderInterval: (value: number, unit: 'minutes' | 'hours') => void
  removeReminderInterval: (id: number) => void
  selectedChecklist: BoardChecklistItem[]
  newChecklistItem: string
  setNewChecklistItem: (value: string) => void
  addChecklistItem: () => void
  toggleChecklistItem: (id: number) => void
  removeChecklistItem: (id: number) => void
  selectedSubtasks: BoardSubtask[]
  newSubtaskTitle: string
  setNewSubtaskTitle: (value: string) => void
  subtaskBusy: boolean
  addSubtask: () => void
  recurrenceRule: RecurrenceRule | null
  recurrenceDraft: Pick<RecurrenceRule, 'freq' | 'interval' | 'byweekday' | 'byday' | 'until' | 'count'>
  setRecurrenceDraft: Dispatch<SetStateAction<Pick<RecurrenceRule, 'freq' | 'interval' | 'byweekday' | 'byday' | 'until' | 'count'>>>
  recurrencePreset: 'none' | 'daily' | 'weekdays' | 'weekly' | 'monthly' | 'yearly'
  recurrenceLoading: boolean
  recurrenceBusy: boolean
  recurrenceError: string
  applyRecurrencePreset: (preset: 'none' | 'daily' | 'weekdays' | 'weekly' | 'monthly' | 'yearly') => void
  comments: CardComment[]
  newComment: string
  setNewComment: (value: string) => void
  editingCommentId: number | null
  editingCommentText: string
  setEditingCommentText: (value: string) => void
  commentsLoading: boolean
  commentsBusy: boolean
  commentsError: string
  addComment: () => void
  startEditComment: (comment: CardComment) => void
  cancelEditComment: () => void
  saveEditedComment: (commentId: number) => void
  deleteComment: (commentId: number) => void
  activities: CardActivity[]
  activityLoading: boolean
  activityError: string
  reloadActivity: () => Promise<void>
  selectedAttachments: BoardAttachment[]
  newAttachmentType: 'file' | 'link' | 'photo'
  setNewAttachmentType: (value: 'file' | 'link' | 'photo') => void
  attachmentFileInputKey: number
  attachmentFileInputRef: MutableRefObject<HTMLInputElement | null>
  setNewAttachmentFiles: (files: File[]) => void
  newAttachmentFiles: File[]
  newAttachmentName: string
  setNewAttachmentName: (value: string) => void
  newAttachmentUrl: string
  setNewAttachmentUrl: (value: string) => void
  addAttachment: () => void
  removeAttachment: (item: { id: string; type: 'file' | 'link' | 'photo' }) => Promise<void>
  assignees: AssigneeOption[]
  selectedCardId: number | null
  profileTimeZone: string
  getTimeZoneLabel: (value: string | null | undefined) => string
  scheduleDeadlineSave: () => void
  selectedPriority: BoardPriority | ''
  allKnownLabels: BoardLabel[]
  selectedLabels: BoardLabel[]
  newLabel: string
  setNewLabel: (value: string) => void
  addLabelValue: (value: string | BoardLabel) => void
  removeLabel: (name: string) => void
  addLabel: () => void
}

export type MainSectionProps = Pick<TaskModalProps, 'draft' | 'setDraft'>

export type RemindersSectionProps = Pick<
  TaskModalProps,
  | 'draft'
  | 'reminderDrafts'
  | 'reminderData'
  | 'reminderLoading'
  | 'reminderError'
  | 'reminderFieldError'
  | 'newReminderValue'
  | 'setNewReminderValue'
  | 'newReminderUnit'
  | 'setNewReminderUnit'
  | 'applyReminderValue'
  | 'applyReminderUnit'
  | 'applyReminderChannel'
  | 'toggleReminder'
  | 'addReminderInterval'
  | 'removeReminderInterval'
>

export type ChecklistSectionProps = Pick<
  TaskModalProps,
  'selectedChecklist' | 'newChecklistItem' | 'setNewChecklistItem' | 'addChecklistItem' | 'toggleChecklistItem' | 'removeChecklistItem'
>

export type SubtasksSectionProps = Pick<
  TaskModalProps,
  'selectedSubtasks' | 'newSubtaskTitle' | 'setNewSubtaskTitle' | 'subtaskBusy' | 'addSubtask' | 'getTimeZoneLabel' | 'profileTimeZone'
>

export type RecurrenceSectionProps = Pick<
  TaskModalProps,
  | 'draft'
  | 'recurrenceRule'
  | 'recurrenceDraft'
  | 'setRecurrenceDraft'
  | 'recurrencePreset'
  | 'recurrenceLoading'
  | 'recurrenceBusy'
  | 'recurrenceError'
  | 'applyRecurrencePreset'
>

export type CommentsSectionProps = Pick<
  TaskModalProps,
  | 'comments'
  | 'newComment'
  | 'setNewComment'
  | 'editingCommentId'
  | 'editingCommentText'
  | 'setEditingCommentText'
  | 'commentsLoading'
  | 'commentsBusy'
  | 'commentsError'
  | 'addComment'
  | 'startEditComment'
  | 'cancelEditComment'
  | 'saveEditedComment'
  | 'deleteComment'
>

export type ActivitySectionProps = Pick<
  TaskModalProps,
  'activities' | 'activityLoading' | 'activityError' | 'reloadActivity'
>

export type AttachmentsSectionProps = Pick<
  TaskModalProps,
  | 'selectedAttachments'
  | 'newAttachmentType'
  | 'setNewAttachmentType'
  | 'attachmentFileInputKey'
  | 'attachmentFileInputRef'
  | 'setNewAttachmentFiles'
  | 'newAttachmentFiles'
  | 'newAttachmentName'
  | 'setNewAttachmentName'
  | 'newAttachmentUrl'
  | 'setNewAttachmentUrl'
  | 'addAttachment'
  | 'removeAttachment'
>

export type MetaSectionProps = Pick<
  TaskModalProps,
  'draft' | 'setDraft' | 'assignees' | 'selectedCardId' | 'profileTimeZone' | 'getTimeZoneLabel' | 'scheduleDeadlineSave'
>

export type PrioritySectionProps = Pick<TaskModalProps, 'setDraft' | 'selectedCardId' | 'selectedPriority'>

export type LabelsSectionProps = Pick<
  TaskModalProps,
  'allKnownLabels' | 'selectedLabels' | 'newLabel' | 'setNewLabel' | 'addLabelValue' | 'removeLabel' | 'addLabel'
>
