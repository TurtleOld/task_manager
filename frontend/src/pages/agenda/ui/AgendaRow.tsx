import { useId } from 'react'
import { Link } from 'react-router-dom'
import { Checkbox } from '@radix-ui/react-checkbox'
import { Calendar, Check, Flag, GitBranch, ListChecks, Repeat } from 'lucide-react'
import type { AgendaBoundaries, AgendaCard, Board } from '../../../api/types'
import { priorityToLabel, priorityToTone } from '../../../shared/lib/priority'
import { formatDeadlineShort } from '../lib/formatDeadline'
import type { AgendaGroupId } from '../lib/grouping'
import { useSwipeRow } from '../hooks/useSwipeRow'
import { SWIPE_ACTION_THRESHOLD_PX } from '../lib/swipeGesture'
import { ColorDot, ProgressBar } from '@/components/ui'
import { cn } from '@/lib/utils'
import { DeadlinePicker } from './DeadlinePicker'

interface AgendaRowProps {
  boundaries: AgendaBoundaries
  busy: boolean
  card: AgendaCard
  deadlineBusy: boolean
  group: AgendaGroupId
  listMeta?: Board
  onCompleteToggle: (card: AgendaCard, complete: boolean) => void
  onDeadlineCommit: (card: AgendaCard, deadline: string | null) => void
  onSwipeComplete: (card: AgendaCard) => void
  onSwipeTomorrow: (card: AgendaCard) => void
}

function formatCompletedTime(value: string): string {
  return new Date(value).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
}

const priorityToneToClass: Record<'neutral' | 'danger' | 'warning' | 'success', string> = {
  neutral: 'text-text-muted',
  danger: 'text-danger',
  warning: 'text-warning',
  success: 'text-success',
}

export function AgendaRow({
  boundaries,
  busy,
  card,
  deadlineBusy,
  group,
  listMeta,
  onCompleteToggle,
  onDeadlineCommit,
  onSwipeComplete,
  onSwipeTomorrow,
}: AgendaRowProps) {
  const checkboxId = useId()
  const completed = Boolean(card.completed_at)
  const hasPriority = card.priority !== 0 && card.priority != null
  const deadlineTone = group === 'overdue' ? 'text-danger' : group === 'today' ? 'text-warning' : 'text-text-muted'
  const assignee = card.assignee
  const assigneeInitial = assignee ? (assignee.full_name || assignee.username || '?')[0]?.toUpperCase() : null
  const completerName =
    completed && card.completed_by ? card.completed_by.full_name || card.completed_by.username : null
  const checklistPercent = card.checklist_total > 0 ? Math.floor((card.checklist_completed / card.checklist_total) * 100) : 0

  const { ref: swipeRef, action: swipeAction, offsetX } = useSwipeRow({
    disabled: busy,
    onComplete: () => onSwipeComplete(card),
    onTomorrow: () => onSwipeTomorrow(card),
  })
  const swipeReady = swipeAction != null && Math.abs(offsetX) >= SWIPE_ACTION_THRESHOLD_PX

  return (
    <li
      ref={swipeRef}
      className={cn(
        'relative isolate flex min-h-16 items-center gap-3 overflow-hidden rounded-control px-3 transition duration-fast ease-standard hover:bg-surface-hover lg:min-h-12 compact:min-h-12 lg:compact:min-h-10',
        completed && 'bg-surface-hover/50',
      )}
    >
      {offsetX !== 0 ? (
        <div
          aria-hidden="true"
          className={cn(
            'absolute inset-0 -z-10 flex items-center px-4 text-caption font-semibold text-text-inverse transition-colors duration-fast ease-standard',
            offsetX > 0 ? 'justify-start bg-success' : 'justify-end bg-info',
            swipeReady && 'brightness-105',
          )}
        >
          {offsetX > 0 ? (
            <span className="flex items-center gap-1.5">
              <Check className="h-4 w-4" aria-hidden="true" /> Готово
            </span>
          ) : (
            <span className="flex items-center gap-1.5">
              Завтра <Calendar className="h-4 w-4" aria-hidden="true" />
            </span>
          )}
        </div>
      ) : null}

      <div
        className={cn(
          'flex min-w-0 flex-1 items-center gap-3 transition-transform duration-fast ease-standard',
          offsetX !== 0 && 'bg-surface',
        )}
        style={offsetX !== 0 ? { transform: `translateX(${offsetX}px)` } : undefined}
      >
        <Checkbox
          id={checkboxId}
          checked={completed}
          disabled={busy}
          onCheckedChange={(next) => onCompleteToggle(card, next === true)}
          aria-label={completed ? `Снять отметку с задачи «${card.title}»` : `Отметить задачу «${card.title}» выполненной`}
          title={completerName ? `Выполнил(а): ${completerName}` : undefined}
          className={cn(
            'relative flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 border-border-strong bg-surface text-text-inverse transition duration-fast ease-standard',
            'before:absolute before:-inset-3 before:content-[""] lg:before:content-none',
            'data-[state=checked]:border-primary data-[state=checked]:bg-primary data-[state=checked]:text-text-inverse',
            'focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
            'disabled:cursor-not-allowed disabled:opacity-50',
          )}
        >
          <Check className="h-3 w-3" aria-hidden="true" />
        </Checkbox>

        <Link
          to={`/lists/${card.list}/tasks/${card.id}`}
          className={cn(
            'min-w-0 flex-1 truncate rounded-sm text-body-sm text-text transition hover:text-primary',
            completed && 'text-text-muted line-through decoration-text-muted/60',
          )}
          title={card.title}
        >
          {card.title}
        </Link>

        {listMeta ? (
          <span className="hidden shrink-0 items-center gap-1.5 text-caption text-text-muted sm:flex">
            <ColorDot color={listMeta.color} />
            <span className="max-w-[8rem] truncate">{listMeta.name}</span>
          </span>
        ) : null}

        <DeadlinePicker
          boundaries={boundaries}
          busy={deadlineBusy}
          deadline={card.deadline}
          displayText={card.deadline ? formatDeadlineShort(card.deadline, boundaries) : undefined}
          onCommit={(deadline) => onDeadlineCommit(card, deadline)}
          className={cn(deadlineTone, 'relative before:absolute before:-inset-2 before:content-[""] lg:before:content-none')}
        />

        {hasPriority ? (
          <Flag
            className={cn('h-4 w-4 shrink-0', priorityToneToClass[priorityToTone(card.priority)])}
            aria-label={`Приоритет: ${card.priority_label || priorityToLabel(card.priority)}`}
            fill="currentColor"
          />
        ) : null}

        {card.has_checklist ? (
          card.checklist_total > 0 ? (
            <span
              className="flex shrink-0 items-center gap-1.5 text-caption text-text-muted"
              aria-label={`Чек-лист: ${card.checklist_completed} из ${card.checklist_total}`}
            >
              <ListChecks className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>{card.checklist_completed}/{card.checklist_total}</span>
              <ProgressBar percent={checklistPercent} className="w-10" />
            </span>
          ) : (
            <ListChecks className="h-4 w-4 shrink-0 text-text-muted" aria-label="Есть чек-лист" />
          )
        ) : null}
        {card.has_subtasks ? (
          <GitBranch className="h-4 w-4 shrink-0 text-text-muted" aria-label="Есть подзадачи" />
        ) : null}
        {card.is_recurring ? (
          <Repeat className="h-4 w-4 shrink-0 text-text-muted" aria-label="Повторяющаяся задача" />
        ) : null}

        {completed && completerName ? (
          <span className="hidden shrink-0 text-caption text-text-muted lg:inline">
            выполнил(а) {completerName}{card.completed_at ? `, ${formatCompletedTime(card.completed_at)}` : ''}
          </span>
        ) : null}

        {assignee ? (
          <span
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/12 text-[0.65rem] font-bold text-primary"
            title={assignee.full_name || assignee.username}
            aria-label={`Исполнитель: ${assignee.full_name || assignee.username}`}
          >
            {assigneeInitial}
          </span>
        ) : null}
      </div>
    </li>
  )
}
