import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import clsx from 'clsx'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Archive, Check, GitBranch, ListChecks, MoreHorizontal, Paperclip, X } from 'lucide-react'
import { Checkbox as RadixCheckbox } from '@radix-ui/react-checkbox'
import { api } from '../../api/client'
import { queryKeys } from '../../api/queries/keys'
import {
  useAssignableUsers,
  useTask,
  useTaskAddAttachment,
  useTaskAddComment,
  useTaskAddSubtask,
  useTaskArchive,
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
import { Button, ErrorState, Skeleton } from '@/components/ui'
import { Modal } from '@/components/ui'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { useBoards } from '../../api/queries/boards'
import { useTaskRealtime } from './hooks/useTaskRealtime'
import { formatCompletedBy } from './lib/completedLabel'
import { buildHistoryEntries } from './lib/history'
import { ChecklistEditor } from './ui/ChecklistEditor'
import { SubtasksPanel } from './ui/SubtasksPanel'
import { AttachmentsPanel } from './ui/AttachmentsPanel'
import { TaskFeed } from './ui/TaskFeed'
import { TaskProperties } from './ui/TaskProperties'
import { priorityRing } from './lib/taskFormat'

type SectionKey = 'checklist' | 'subtasks' | 'attachments'

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

  useTaskRealtime({ boardId: task?.board ?? null, taskId })

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

  const handleClose = () => {
    api.notifyCardUpdated(taskId).catch(() => {})
    onClose()
  }

  const [confirmArchive, setConfirmArchive] = useState(false)
  const archiveMutation = useTaskArchive(taskId)
  const archiveTask = () => {
    archiveMutation.mutate(undefined, {
      onSuccess: () => {
        setConfirmArchive(false)
        toast.success('Задача отправлена в архив')
        onClose()
      },
      onError: () => toast.error('Не удалось отправить задачу в архив'),
    })
  }

  const [title, setTitle] = useState(task?.title ?? '')
  const [titleFocused, setTitleFocused] = useState(false)
  const [description, setDescription] = useState(task?.description ?? '')
  // Пустые разделы не рисуются: раздел появляется, когда в нём что-то есть или его открыли кнопкой.
  const [openSections, setOpenSections] = useState<Record<SectionKey, boolean>>({ checklist: false, subtasks: false, attachments: false })
  const openSection = (key: SectionKey) => setOpenSections((prev) => ({ ...prev, [key]: true }))

  useEffect(() => {
    setOpenSections({ checklist: false, subtasks: false, attachments: false })
  }, [taskId])
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

  const board = boards.find((item) => item.id === task.board)
  const isSubtask = task.parent != null
  const checklistItems = [...task.checklist].sort((a, b) => a.position - b.position)
  const showChecklist = checklistItems.length > 0 || openSections.checklist
  const showSubtasks = !isSubtask && (task.subtasks.length > 0 || openSections.subtasks)
  const showAttachments = task.attachments.length > 0 || openSections.attachments

  return (
    <Modal
      open
      onClose={handleClose}
      title={task.title || 'Задача'}
      className="p-0 max-w-5xl w-[calc(100%-2rem)] flex flex-col max-h-[calc(100vh-2rem)] overflow-hidden border-0 bg-surface focus-visible:ring-0 focus-visible:ring-offset-0"
    >
      <header className="shrink-0 border-b border-border/60 px-5 pb-4 pt-4 sm:px-7 sm:pb-5">
        <div className="flex items-center gap-2 text-body-sm text-text-muted">
          <span className="tabular-nums">#{task.id}</span>
          {isSubtask ? (
            <Link to={`/lists/${listId}/tasks/${task.parent}`} className="hover:text-text">
              подзадача
            </Link>
          ) : boardName ? (
            <span className="truncate">в списке {boardName}</span>
          ) : null}
          <div className="ml-auto flex shrink-0 items-center gap-0.5">
            <TaskMenu
              shoppingList={task.is_shopping_list === true}
              canBeShoppingList={!isSubtask}
              onShoppingListChange={(checked) =>
                updateField.mutate(
                  { is_shopping_list: checked },
                  { onSuccess: () => void qc.invalidateQueries({ queryKey: queryKeys.familyToday() }) },
                )
              }
              onArchive={() => setConfirmArchive(true)}
            />
            <button
              type="button"
              onClick={handleClose}
              aria-label="Закрыть окно"
              className="flex h-8 w-8 items-center justify-center rounded-control text-text-muted transition hover:bg-surface-hover hover:text-text"
            >
              <X className="h-[18px] w-[18px]" aria-hidden="true" />
            </button>
          </div>
        </div>

        <div className="mt-3 flex items-start gap-3.5">
          <RadixCheckbox
            checked={completed}
            disabled={completeMutation.isPending}
            onCheckedChange={(next) => completeMutation.mutate({ complete: next === true })}
            aria-label={completed ? `Снять отметку с задачи «${task.title}»` : `Отметить задачу «${task.title}» выполненной`}
            className={clsx(
              'mt-[0.45rem] flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 text-text-inverse transition active:scale-95',
              priorityRing(task.priority),
              'data-[state=checked]:border-primary data-[state=checked]:bg-primary',
            )}
          >
            <Check className="h-3.5 w-3.5" strokeWidth={3} aria-hidden="true" />
          </RadixCheckbox>
          <div className="min-w-0 flex-1">
            <TitleField
              value={title}
              completed={completed}
              onChange={setTitle}
              onFocus={() => setTitleFocused(true)}
              onCommit={commitTitle}
            />
            {completed && completedLabel ? (
              <p className="mt-0.5 text-body-sm text-text-muted">Выполнил(а) {completedLabel}</p>
            ) : null}
          </div>
        </div>

        <div className="mt-3 sm:ml-[2.375rem]">
          <TaskProperties
            task={task}
            board={board}
            boundaries={effectiveBoundaries}
            assignableUsers={assignableUsers}
            listId={listId}
            onUpdate={(patch) => updateField.mutate(patch)}
          />
        </div>
      </header>

      <div className="grid min-h-0 flex-1 overflow-y-auto lg:grid-cols-[minmax(0,1fr)_22rem] lg:overflow-hidden">
        <div className="min-w-0 space-y-7 px-5 py-5 sm:px-7 lg:overflow-y-auto">
          <DescriptionField
            value={description}
            onChange={setDescription}
            onFocus={() => setDescriptionFocused(true)}
            onCommit={commitDescription}
          />

          {showChecklist ? (
            <ChecklistEditor
              items={checklistItems}
              autoFocus={openSections.checklist && checklistItems.length === 0}
              onAdd={(text) =>
                checklistAdd.mutate(
                  { text },
                  { onError: () => toast.error('Не удалось добавить пункт') },
                )
              }
              onToggle={(id, done) => {
                checklistUpdate.mutate({ itemId: id, payload: { done } })
              }}
              onDelete={(id) => {
                checklistDelete.mutate(id, {
                  onError: () => toast.error('Не удалось удалить пункт'),
                })
              }}
              onReorder={(orderedIds) => checklistReorder.mutate(orderedIds)}
            />
          ) : null}

          {showSubtasks ? (
            <SubtasksPanel
              listId={listId}
              subtasks={task.subtasks}
              autoFocus={openSections.subtasks && task.subtasks.length === 0}
              addBusy={addSubtaskMutation.isPending}
              onAdd={(subtaskTitle) =>
                addSubtaskMutation.mutate(
                  { title: subtaskTitle },
                  { onError: () => toast.error('Не удалось добавить подзадачу') },
                )
              }
              onToggleComplete={(id, complete) => {
                subtaskCompleteMutation.mutate(
                  { id, complete },
                  { onError: () => toast.error('Не удалось изменить отметку подзадачи') },
                )
              }}
            />
          ) : null}

          {showAttachments ? (
            <AttachmentsPanel
              attachments={task.attachments}
              autoPick={openSections.attachments && task.attachments.length === 0}
              busy={addAttachmentLink.isPending || uploadAttachments.isPending}
              uploadProgress={uploadAttachments.progress}
              onAddLink={(payload) =>
                addAttachmentLink.mutate(payload, {
                  onError: () => toast.error('Не удалось добавить вложение'),
                })
              }
              onUpload={(files, type) =>
                uploadAttachments.mutate({ files, type })
              }
              onDelete={(attachmentId) =>
                deleteAttachment.mutate(attachmentId, {
                  onError: () => toast.error('Не удалось удалить вложение'),
                })
              }
            />
          ) : null}

          {!showChecklist || !showSubtasks || !showAttachments ? (
            <div className="-mx-2 flex flex-wrap gap-1" role="group" aria-label="Добавить в задачу">
              {!showChecklist ? (
                <AddSectionButton icon={ListChecks} label="Чек-лист" onClick={() => openSection('checklist')} />
              ) : null}
              {!isSubtask && !showSubtasks ? (
                <AddSectionButton icon={GitBranch} label="Подзадача" onClick={() => openSection('subtasks')} />
              ) : null}
              {!showAttachments ? (
                <AddSectionButton icon={Paperclip} label="Вложение" onClick={() => openSection('attachments')} />
              ) : null}
            </div>
          ) : null}
        </div>

        <TaskFeed
          comments={comments}
          history={historyEntries}
          loading={commentsLoading || activityQuery.isLoading}
          busy={commentsBusy}
          timeZone={timeZone}
          onAdd={(text) => addComment.mutate({ text }, { onError: () => toast.error('Не удалось добавить комментарий') })}
          onUpdate={(commentId, text) =>
            updateComment.mutate({ commentId, text }, { onError: () => toast.error('Не удалось изменить комментарий') })
          }
          onDelete={(commentId) =>
            deleteComment.mutate(commentId, { onError: () => toast.error('Не удалось удалить комментарий') })
          }
        />
      </div>

      <Dialog open={confirmArchive} onOpenChange={setConfirmArchive}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Отправить задачу в архив?</DialogTitle>
            <DialogDescription>
              Задача «{task.title}» уйдёт в архив и пропадёт из агенды. Её можно будет восстановить на странице архива.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setConfirmArchive(false)}>
              Отмена
            </Button>
            <Button variant="danger" onClick={archiveTask} disabled={archiveMutation.isPending}>
              В архив
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Modal>
  )
}

function TitleField({
  value,
  completed,
  onChange,
  onFocus,
  onCommit,
}: {
  value: string
  completed: boolean
  onChange: (value: string) => void
  onFocus: () => void
  onCommit: () => void
}) {
  const ref = useAutoHeight(value)
  return (
    <textarea
      ref={ref}
      rows={1}
      value={value}
      onChange={(event) => onChange(event.target.value.replace(/\n/g, ' '))}
      onFocus={onFocus}
      onBlur={onCommit}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault()
          event.currentTarget.blur()
        }
      }}
      aria-label="Название задачи"
      className={clsx(
        '-mx-1.5 block w-[calc(100%+0.75rem)] resize-none overflow-hidden rounded-control bg-transparent px-1.5 py-0.5 text-[1.625rem] font-semibold leading-tight tracking-[-0.02em] outline-none transition-colors [text-wrap:balance] hover:bg-surface-hover focus:bg-background-subtle focus-visible:ring-0 focus-visible:ring-offset-0',
        completed ? 'text-text-muted line-through decoration-text-muted/50 decoration-2' : 'text-text',
      )}
    />
  )
}

function DescriptionField({
  value,
  onChange,
  onFocus,
  onCommit,
}: {
  value: string
  onChange: (value: string) => void
  onFocus: () => void
  onCommit: () => void
}) {
  const ref = useAutoHeight(value)
  return (
    <textarea
      ref={ref}
      rows={1}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      onFocus={onFocus}
      onBlur={onCommit}
      placeholder="Добавьте описание: что сделать, где, какие условия"
      aria-label="Описание"
      className="-mx-2 block min-h-10 w-[calc(100%+1rem)] resize-none overflow-hidden rounded-control bg-transparent px-2 py-1.5 text-body leading-relaxed text-text outline-none transition-colors [text-wrap:pretty] placeholder:text-text-muted/70 hover:bg-surface-hover focus:bg-background-subtle focus-visible:ring-0 focus-visible:ring-offset-0"
    />
  )
}

/** Поле растёт под текст; ширина меняется и во время анимации окна, поэтому следим и за ней. */
function useAutoHeight(value: string) {
  const ref = useRef<HTMLTextAreaElement>(null)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const fit = () => {
      el.style.height = 'auto'
      el.style.height = `${el.scrollHeight}px`
    }
    fit()
    const observer = new ResizeObserver(fit)
    observer.observe(el)
    return () => observer.disconnect()
  }, [value])
  return ref
}

function AddSectionButton({ icon: Icon, label, onClick }: { icon: typeof ListChecks; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex h-8 items-center gap-1.5 rounded-control px-2 text-body-sm text-text-muted transition hover:bg-surface-hover hover:text-text"
    >
      <Icon className="h-4 w-4" aria-hidden="true" />
      {label}
    </button>
  )
}

function TaskMenu({
  shoppingList,
  canBeShoppingList,
  onShoppingListChange,
  onArchive,
}: {
  shoppingList: boolean
  canBeShoppingList: boolean
  onShoppingListChange: (checked: boolean) => void
  onArchive: () => void
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Действия с задачей"
          className="flex h-8 w-8 items-center justify-center rounded-control text-text-muted transition hover:bg-surface-hover hover:text-text data-[state=open]:bg-surface-hover"
        >
          <MoreHorizontal className="h-[18px] w-[18px]" aria-hidden="true" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72 rounded-panel border-border/60 bg-surface-elevated p-1.5 shadow-overlay">
        {canBeShoppingList ? (
          <DropdownMenuItem
            onSelect={(event) => {
              event.preventDefault()
              onShoppingListChange(!shoppingList)
            }}
            role="menuitemcheckbox"
            aria-checked={shoppingList}
            className="items-start gap-3 rounded-control px-2.5 py-2"
          >
            <span className="min-w-0 flex-1">
              <span className="block text-body-sm text-text">Показывать в «Сегодня у семьи»</span>
              <span className="block text-caption font-normal text-text-muted">Чек-лист станет общим списком покупок</span>
            </span>
            <span
              className={clsx(
                'relative mt-0.5 h-[18px] w-8 shrink-0 rounded-full transition-colors',
                shoppingList ? 'bg-primary' : 'bg-border-strong',
              )}
              aria-hidden="true"
            >
              <span
                className={clsx(
                  'absolute left-0.5 top-0.5 h-3.5 w-3.5 rounded-full bg-white transition-transform duration-normal ease-entrance',
                  shoppingList && 'translate-x-3.5',
                )}
              />
            </span>
          </DropdownMenuItem>
        ) : null}
        {canBeShoppingList ? <DropdownMenuSeparator className="mx-1 bg-border/60" /> : null}
        <DropdownMenuItem onSelect={onArchive} className="gap-2.5 rounded-control px-2.5 py-2 text-body-sm">
          <Archive className="h-4 w-4 text-text-muted" aria-hidden="true" />
          Отправить в архив
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function fallbackBoundaries(timeZone: string): AgendaBoundaries {
  const now = new Date().toISOString()
  return { timezone: timeZone, today_start: now, tomorrow_start: now, day_after_start: now, week_end: now }
}
