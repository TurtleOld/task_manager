import type { Dispatch, MutableRefObject, SetStateAction } from 'react'
import type { Card, CardDeadlineReminder, CardDeadlineReminderResponse } from '../../../../api/types'
import type { AssigneeOption, BoardAttachment, BoardCardDraft, BoardChecklistItem, BoardLabel, BoardPriority } from '../../types'

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
  toggleChecklistItem: (id: string) => void
  removeChecklistItem: (id: string) => void
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
