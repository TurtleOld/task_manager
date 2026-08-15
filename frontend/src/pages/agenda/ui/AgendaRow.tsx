import { useId } from 'react'
import { Link } from 'react-router-dom'
import { Checkbox } from '@radix-ui/react-checkbox'
import { Check, Flag, GitBranch, ListChecks } from 'lucide-react'
import type { AgendaBoundaries, AgendaCard } from '../../../api/types'
import { priorityToLabel, priorityToTone } from '../../board/lib/priority'
import { formatDeadlineShort } from '../lib/formatDeadline'
import type { AgendaGroupId } from '../lib/grouping'
import { cn } from '@/lib/utils'
import { DeadlinePicker } from './DeadlinePicker'

interface AgendaRowProps {
  boundaries: AgendaBoundaries
  busy: boolean
  card: AgendaCard
  deadlineBusy: boolean
  group: AgendaGroupId
  onCompleteToggle: (card: AgendaCard, complete: boolean) => void
  onDeadlineCommit: (card: AgendaCard, deadline: string | null) => void
}

const priorityToneToClass: Record<'neutral' | 'danger' | 'warning' | 'success', string> = {
  neutral: 'text-text-muted',
  danger: 'text-danger',
  warning: 'text-warning',
  success: 'text-success',
}

export function AgendaRow({ boundaries, busy, card, deadlineBusy, group, onCompleteToggle, onDeadlineCommit }: AgendaRowProps) {
  const checkboxId = useId()
  const completed = Boolean(card.completed_at)
  const hasPriority = card.priority !== 0 && card.priority != null
  const deadlineTone = group === 'overdue' ? 'text-danger' : group === 'today' ? 'text-warning' : 'text-text-muted'
  const assignee = card.assignee
  const assigneeInitial = assignee ? (assignee.full_name || assignee.username || '?')[0]?.toUpperCase() : null
  const completerName =
    completed && card.completed_by ? card.completed_by.full_name || card.completed_by.username : null

  return (
    <li className={cn('flex h-12 items-center gap-3 rounded-control px-3 transition duration-fast ease-standard hover:bg-surface-hover compact:h-10', completed && 'bg-surface-hover/50')}>
      <Checkbox
        id={checkboxId}
        checked={completed}
        disabled={busy}
        onCheckedChange={(next) => onCompleteToggle(card, next === true)}
        aria-label={completed ? `Снять отметку с задачи «${card.title}»` : `Отметить задачу «${card.title}» выполненной`}
        title={completerName ? `Выполнил(а): ${completerName}` : undefined}
        className={cn(
          'flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 border-border-strong bg-surface text-text-inverse transition duration-fast ease-standard',
          'data-[state=checked]:border-primary data-[state=checked]:bg-primary data-[state=checked]:text-text-inverse',
          'focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
          'disabled:cursor-not-allowed disabled:opacity-50',
        )}
      >
        <Check className="h-3 w-3" aria-hidden="true" />
      </Checkbox>

      <Link
        to={`/boards/${card.list}/cards/${card.id}`}
        className={cn(
          'min-w-0 flex-1 truncate rounded-sm text-body-sm text-text transition hover:text-primary',
          completed && 'text-text-muted line-through decoration-text-muted/60',
        )}
        title={card.title}
      >
        {card.title}
      </Link>

      <DeadlinePicker
        boundaries={boundaries}
        busy={deadlineBusy}
        deadline={card.deadline}
        displayText={card.deadline ? formatDeadlineShort(card.deadline, boundaries) : undefined}
        onCommit={(deadline) => onDeadlineCommit(card, deadline)}
        className={deadlineTone}
      />

      {hasPriority ? (
        <Flag
          className={cn('h-4 w-4 shrink-0', priorityToneToClass[priorityToTone(card.priority)])}
          aria-label={`Приоритет: ${card.priority_label || priorityToLabel(card.priority)}`}
          fill="currentColor"
        />
      ) : null}

      {card.has_checklist ? (
        <ListChecks className="h-4 w-4 shrink-0 text-text-muted" aria-label="Есть чек-лист" />
      ) : null}
      {card.has_subtasks ? (
        <GitBranch className="h-4 w-4 shrink-0 text-text-muted" aria-label="Есть подзадачи" />
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
    </li>
  )
}
