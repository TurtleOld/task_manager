import { useEffect, useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Check } from 'lucide-react'
import { Checkbox as RadixCheckbox } from '@radix-ui/react-checkbox'
import { api } from '../../api/client'
import { queryKeys } from '../../api/queries/keys'
import {
  useAssignableUsers,
  useTask,
  useTaskAddAttachment,
  useTaskAddComment,
  useTaskAddSubtask,
  useTaskChecklistAdd,
  useTaskChecklistDelete,
  useTaskChecklistReorder,
  useTaskChecklistUpdate,
  useTaskComments,
  useTaskComplete,
  useTaskDeleteAttachment,
  useTaskDeleteComment,
  useTaskSubtaskComplete,
  useTaskUpdateComment,
  useTaskUpdateField,
  useTaskUploadAttachments,
} from '../../api/queries/task'
import type { AgendaBoundaries, AuthUser } from '../../api/types'
import { AUTH_TOKEN_KEY } from '../../app/auth'
import { Badge, Card as SurfaceCard, Checkbox, ChipButton, ErrorState, Field, Select, Skeleton, Textarea, TextInput } from '@/components/ui'
import { Modal } from '@/components/ui'
import { priorityToLabel, priorityToTone } from '../../shared/lib/priority'
import { useBoards } from '../../api/queries/boards'
import { formatDeadlineShort } from '../agenda/lib/formatDeadline'
import { DeadlinePicker } from '../agenda/ui/DeadlinePicker'
import { useTaskRealtime } from './hooks/useTaskRealtime'
import { formatCompletedBy } from './lib/completedLabel'
import { buildHistoryEntries } from './lib/history'
import { ChecklistEditor } from './ui/ChecklistEditor'
import { SubtasksPanel } from './ui/SubtasksPanel'
import { AttachmentsPanel } from './ui/AttachmentsPanel'
import { CommentsPanel } from './ui/CommentsPanel'
import { HistoryPanel } from './ui/HistoryPanel'
import { RemindersPanel } from './ui/RemindersPanel'
import { RecurrencePanel } from './ui/RecurrencePanel'

const priorityOptions: Array<0 | 1 | 2 | 3> = [0, 1, 2, 3]

interface TaskScreenProps {
  taskId: number
  listId: number
  user: AuthUser
  boundaries?: AgendaBoundaries
  onClose: () => void
}

export function TaskScreen({ taskId, listId, user, boundaries, onClose }: TaskScreenProps) {
  const qc = useQueryClient()
  const { data: task, isLoading, isError, refetch } = useTask(taskId)
  const { data: boards = [] } = useBoards()
  const { data: assignableUsers = [] } = useAssignableUsers(user)
  const activityQuery = useQuery({
    queryKey: queryKeys.cardActivity(taskId),
    queryFn: () => api.listCardActivity(taskId),
  })

  const wsToken = localStorage.getItem(AUTH_TOKEN_KEY)
  useTaskRealtime({ boardId: task?.board ?? null, taskId, token: wsToken })

  const updateField = useTaskUpdateField(taskId)
  const completeMutation = useTaskComplete(taskId, user.id)
  const subtaskCompleteMutation = useTaskSubtaskComplete(taskId, user.id)
  const addSubtaskMutation = useTaskAddSubtask(taskId)
  const checklistAdd = useTaskChecklistAdd(taskId)
  const checklistUpdate = useTaskChecklistUpdate(taskId)
  const checklistDelete = useTaskChecklistDelete(taskId)
  const checklistReorder = useTaskChecklistReorder(taskId)
  const addAttachmentLink = useTaskAddAttachment(taskId)
  const uploadAttachments = useTaskUploadAttachments(taskId)
  const deleteAttachment = useTaskDeleteAttachment(taskId)
  const { data: comments = [], isLoading: commentsLoading } = useTaskComments(taskId)
  const addComment = useTaskAddComment(taskId)
  const updateComment = useTaskUpdateComment(taskId)
  const deleteComment = useTaskDeleteComment(taskId)
  const commentsBusy = addComment.isPending || updateComment.isPending || deleteComment.isPending

  const [title, setTitle] = useState(task?.title ?? '')
  const [titleFocused, setTitleFocused] = useState(false)
  const [description, setDescription] = useState(task?.description ?? '')
  const [descriptionFocused, setDescriptionFocused] = useState(false)

  useEffect(() => {
    if (!titleFocused && task) setTitle(task.title)
  }, [task, task?.title, titleFocused])

  useEffect(() => {
    if (!descriptionFocused && task) setDescription(task.description)
  }, [task, task?.description, descriptionFocused])

  const boardName = boards.find((board) => board.id === task?.board)?.name ?? ''
  const timeZone = boundaries?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone

  const resolveAssigneeName = useMemo(() => {
    const map = new Map(assignableUsers.map((item) => [item.id, item.name]))
    return (id: number) => map.get(id) ?? `#${id}`
  }, [assignableUsers])

  const formatDeadlineValue = (value: unknown) => {
    if (value == null || value === '') return 'без срока'
    const iso = String(value)
    const date = new Date(iso)
    if (Number.isNaN(date.getTime())) return String(value)
    return date.toLocaleString('ru-RU', { timeZone, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  }

  const historyEntries = useMemo(
    () => buildHistoryEntries(activityQuery.data ?? [], resolveAssigneeName, formatDeadlineValue),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activityQuery.data, resolveAssigneeName, timeZone],
  )

  if (isLoading || !task) {
    return (
      <Modal open onClose={onClose} title="Задача" className="p-0 max-w-5xl w-[calc(100%-2rem)] flex flex-col max-h-[calc(100vh-2rem)]">
        <div className="space-y-4 p-6">
          <Skeleton className="h-8 w-2/3" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      </Modal>
    )
  }

  if (isError) {
    return (
      <Modal open onClose={onClose} title="Задача" className="max-w-lg">
        <ErrorState action={{ label: 'Повторить', onClick: () => void refetch() }}>Не удалось загрузить задачу.</ErrorState>
      </Modal>
    )
  }

  const effectiveBoundaries = boundaries ?? fallbackBoundaries(timeZone)
  const completed = Boolean(task.completed_at)
  const completedName = task.completed_by_detail
    ? task.completed_by_detail.full_name || task.completed_by_detail.username
    : task.completed_by != null
      ? resolveAssigneeName(task.completed_by)
      : 'Кто-то'
  const completedLabel = completed && task.completed_at ? formatCompletedBy(completedName, task.completed_at, timeZone) : ''

  const commitTitle = () => {
    setTitleFocused(false)
    const value = title.trim()
    if (!value || value === task.title) {
      setTitle(task.title)
      return
    }
    updateField.mutate({ title: value })
  }

  const commitDescription = () => {
    setDescriptionFocused(false)
    if (description === task.description) return
    updateField.mutate({ description })
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={task.title || 'Задача'}
      className="p-0 max-w-5xl w-[calc(100%-2rem)] flex flex-col max-h-[calc(100vh-2rem)]"
    >
      <div className="shrink-0 rounded-t-overlay border-b border-border bg-surface-elevated px-6 py-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:gap-4">
          <RadixCheckbox
            checked={completed}
            disabled={completeMutation.isPending}
            onCheckedChange={(next) => completeMutation.mutate({ complete: next === true })}
            aria-label={completed ? `Снять отметку с задачи «${task.title}»` : `Отметить задачу «${task.title}» выполненной`}
            className="mt-1.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 border-border-strong bg-surface text-text-inverse transition data-[state=checked]:border-primary data-[state=checked]:bg-primary data-[state=checked]:text-text-inverse"
          >
            <Check className="h-3.5 w-3.5" aria-hidden="true" />
          </RadixCheckbox>
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="neutral">#{task.id}</Badge>
              {boardName ? <Badge variant="info">{boardName}</Badge> : null}
              {task.parent != null ? <Badge variant="neutral">Подзадача</Badge> : null}
            </div>
            <TextInput
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              onFocus={() => setTitleFocused(true)}
              onBlur={commitTitle}
              className="border-transparent bg-transparent px-0 text-h3 font-semibold shadow-none focus:border-primary/50"
              aria-label="Название задачи"
            />
            {completed && completedLabel ? (
              <p className="text-body-sm text-text-muted">Выполнил(а) {completedLabel}</p>
            ) : null}
          </div>
          <button type="button" onClick={onClose} aria-label="Закрыть окно" className="shrink-0 rounded-control px-3 py-2 text-caption font-semibold text-text-muted hover:bg-background-subtle hover:text-text">
            Закрыть
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
        <div className="grid w-full gap-4 lg:grid-cols-2">
          <div className="space-y-4">
            <SurfaceCard as="section" className="space-y-3 p-5">
              <Field label="Описание" htmlFor="task-description">
                <Textarea
                  id="task-description"
                  rows={4}
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  onFocus={() => setDescriptionFocused(true)}
                  onBlur={commitDescription}
                  placeholder="Опишите задачу, ожидания и критерии готовности"
                />
              </Field>
            </SurfaceCard>

            <ChecklistEditor
              items={[...task.checklist].sort((a, b) => a.position - b.position)}
              onAdd={(text) => checklistAdd.mutate({ text }, { onError: () => toast.error('Не удалось добавить пункт') })}
              onToggle={(id, done) => checklistUpdate.mutate({ itemId: id, payload: { done } })}
              onDelete={(id) => checklistDelete.mutate(id, { onError: () => toast.error('Не удалось удалить пункт') })}
              onReorder={(orderedIds) => checklistReorder.mutate(orderedIds)}
            />

            <CommentsPanel
              comments={comments}
              isLoading={commentsLoading}
              busy={commentsBusy}
              onAdd={(text) => addComment.mutate({ text }, { onError: () => toast.error('Не удалось добавить комментарий') })}
              onUpdate={(commentId, text) =>
                updateComment.mutate({ commentId, text }, { onError: () => toast.error('Не удалось изменить комментарий') })
              }
              onDelete={(commentId) =>
                deleteComment.mutate(commentId, { onError: () => toast.error('Не удалось удалить комментарий') })
              }
            />
          </div>

          <div className="space-y-4">
            <RemindersPanel cardId={task.id} hasDeadline={Boolean(task.deadline)} />
            <RecurrencePanel cardId={task.id} hasDeadline={Boolean(task.deadline)} />

            <SurfaceCard as="section" className="space-y-3 p-5">
              <Field label="Срок" htmlFor="task-deadline">
                <DeadlinePicker
                  boundaries={effectiveBoundaries}
                  deadline={task.deadline}
                  displayText={task.deadline ? formatDeadlineShort(task.deadline, effectiveBoundaries) : undefined}
                  onCommit={(deadline) => updateField.mutate({ deadline })}
                  className="w-full justify-start"
                />
              </Field>

              <Field label="Исполнитель" htmlFor="task-assignee">
                <Select
                  id="task-assignee"
                  value={task.assignee ?? ''}
                  onChange={(event) => {
                    const value = event.target.value
                    updateField.mutate({ assignee: value ? Number(value) : null })
                  }}
                >
                  <option value="">Не назначен</option>
                  {assignableUsers.map((item) => (
                    <option key={item.id} value={item.id}>{item.name}</option>
                  ))}
                </Select>
              </Field>

              <Field label="Приоритет" htmlFor="task-priority">
                <div className="flex flex-wrap gap-2" id="task-priority" role="radiogroup" aria-label="Приоритет">
                  {priorityOptions.map((value) => (
                    <ChipButton
                      key={value}
                      tone={priorityToTone(value)}
                      active={task.priority === value}
                      role="radio"
                      aria-checked={task.priority === value}
                      onClick={() => updateField.mutate({ priority: value })}
                    >
                      {priorityToLabel(value)}
                    </ChipButton>
                  ))}
                </div>
              </Field>

              {task.parent == null ? (
                <Checkbox
                  label="Показывать в панели «Сегодня у семьи»"
                  description="Чек-лист этой задачи станет общим списком покупок"
                  checked={task.is_shopping_list === true}
                  onChange={(event) =>
                    updateField.mutate(
                      { is_shopping_list: event.target.checked },
                      { onSuccess: () => void qc.invalidateQueries({ queryKey: queryKeys.familyToday() }) },
                    )
                  }
                />
              ) : null}
            </SurfaceCard>

            {task.parent == null ? (
              <SubtasksPanel
                listId={listId}
                subtasks={task.subtasks}
                addBusy={addSubtaskMutation.isPending}
                onAdd={(subtaskTitle) =>
                  addSubtaskMutation.mutate(
                    { title: subtaskTitle },
                    { onError: () => toast.error('Не удалось добавить подзадачу') },
                  )
                }
                onToggleComplete={(id, complete) =>
                  subtaskCompleteMutation.mutate(
                    { id, complete },
                    { onError: () => toast.error('Не удалось изменить отметку подзадачи') },
                  )
                }
              />
            ) : null}

            <AttachmentsPanel
              attachments={task.attachments}
              busy={addAttachmentLink.isPending || uploadAttachments.isPending}
              onAddLink={(payload) => addAttachmentLink.mutate(payload, { onError: () => toast.error('Не удалось добавить вложение') })}
              onUpload={(files, type) => uploadAttachments.mutate({ files, type }, { onError: () => toast.error('Не удалось загрузить файл') })}
              onDelete={(attachmentId) => deleteAttachment.mutate(attachmentId, { onError: () => toast.error('Не удалось удалить вложение') })}
            />

            <HistoryPanel entries={historyEntries} loading={activityQuery.isLoading} timeZone={timeZone} />
          </div>
        </div>
      </div>
    </Modal>
  )
}

function fallbackBoundaries(timeZone: string): AgendaBoundaries {
  const now = new Date().toISOString()
  return { timezone: timeZone, today_start: now, tomorrow_start: now, day_after_start: now, week_end: now }
}
