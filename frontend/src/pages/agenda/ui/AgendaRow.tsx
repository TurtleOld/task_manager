import { useId } from 'react'
import type { CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import { Checkbox } from '@radix-ui/react-checkbox'
import { Calendar, Check, GitBranch, ListChecks, Repeat } from 'lucide-react'
import type { AgendaBoundaries, AgendaCard, Board } from '../../../api/types'
import { priorityToLabel, priorityToTone } from '../../../shared/lib/priority'
import { formatDeadlineShort } from '../lib/formatDeadline'
import type { AgendaGroupId } from '../lib/grouping'
import { useSwipeRow } from '../hooks/useSwipeRow'
import { SWIPE_ACTION_THRESHOLD_PX } from '../lib/swipeGesture'
import { ProgressBar } from '@/components/ui'
import { cn } from '@/lib/utils'
import { DeadlinePicker } from './DeadlinePicker'
import { ListLabel } from './ListLabel'

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

/** Приоритет показывается цветом кольца чекбокса, а не отдельным флажком. */
const priorityToneToRing: Record<'neutral' | 'danger' | 'warning' | 'success', string> = {
  neutral: 'border-border-strong',
  danger: 'border-danger',
  warning: 'border-warning',
  success: 'border-success',
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
  const deadlineTone = group === 'overdue' ? 'text-danger' : group === 'today' ? 'text-primary' : 'text-text-muted'
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
        'relative isolate flex items-center gap-3 overflow-hidden rounded-control px-3 transition duration-fast ease-standard hover:bg-surface-hover',
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
          'flex min-w-0 flex-1 items-start gap-3 py-2.5 transition-transform duration-fast ease-standard compact:py-1.5',
          offsetX !== 0 && 'bg-surface-elevated',
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
            'relative mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 bg-surface text-text-inverse transition duration-fast ease-standard',
            group === 'overdue' && !completed ? 'border-danger/60' : priorityToneToRing[hasPriority ? priorityToTone(card.priority) : 'neutral'],
            'before:absolute before:-inset-3 before:content-[""] lg:before:content-none',
            'data-[state=checked]:border-primary data-[state=checked]:bg-primary data-[state=checked]:text-text-inverse',
            'focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
            'disabled:cursor-not-allowed disabled:opacity-50',
          )}
        >
          <Check className="h-3 w-3" aria-hidden="true" />
        </Checkbox>

        <div className="min-w-0 flex-1 space-y-1">
          <Link
            to={`/lists/${card.list}/tasks/${card.id}`}
            className={cn(
              'block truncate rounded-sm text-body text-text transition hover:text-primary',
              completed && 'text-text-muted line-through decoration-text-muted/60',
            )}
            title={card.title}
          >
            {card.title}
            {hasPriority ? (
              <span className="sr-only">, приоритет: {card.priority_label || priorityToLabel(card.priority)}</span>
            ) : null}
          </Link>

          {/* Без cn: tailwind-merge принимает text-body-sm за цвет и выбрасывает его рядом с text-text-muted. */}
          <div className={`flex flex-wrap items-center gap-x-3 gap-y-1 text-body-sm text-text-muted${completed ? ' opacity-70' : ''}`}>
            {listMeta ? <ListLabel board={listMeta} /> : null}

            {completed && completerName ? (
              <span>
                Выполнил(а) {completerName}{card.completed_at ? `, ${formatCompletedTime(card.completed_at)}` : ''}
              </span>
            ) : (
              <DeadlinePicker
                boundaries={boundaries}
                busy={deadlineBusy}
                deadline={card.deadline}
                displayText={card.deadline ? formatDeadlineShort(card.deadline, boundaries) : undefined}
                onCommit={(deadline) => onDeadlineCommit(card, deadline)}
                className={cn(deadlineTone, '-mx-1.5 h-6 px-1.5 relative before:absolute before:-inset-2 before:content-[""] lg:before:content-none')}
              />
            )}

            {card.is_recurring ? (
              <span className="inline-flex items-center gap-1 text-info">
                <Repeat className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                повторяется
              </span>
            ) : null}

            {card.has_checklist ? (
              card.checklist_total > 0 ? (
                <span
                  className="inline-flex items-center gap-1.5"
                  aria-label={`Чек-лист: ${card.checklist_completed} из ${card.checklist_total}`}
                >
                  <ListChecks className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  <span>{card.checklist_completed}/{card.checklist_total}</span>
                  <ProgressBar percent={checklistPercent} className="w-10" />
                </span>
              ) : (
                <ListChecks className="h-3.5 w-3.5 shrink-0" aria-label="Есть чек-лист" />
              )
            ) : null}
            {card.has_subtasks ? (
              <span className="inline-flex items-center gap-1">
                <GitBranch className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                подзадачи
              </span>
            ) : null}
          </div>
        </div>

        {assignee ? (
          <span
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/15 text-caption font-bold text-primary"
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

/** Название списка его собственным цветом на лёгкой подложке того же цвета. */
function ListLabel({ board }: { board: Board }) {
  return (
    <span
      style={{ '--list-color': board.color || 'rgb(var(--color-primary))' } as CSSProperties}
      className="inline-flex max-w-[12rem] items-center gap-1 rounded-sm bg-[color:color-mix(in_srgb,var(--list-color)_14%,transparent)] px-1.5 font-medium text-[color:color-mix(in_srgb,var(--list-color)_80%,black)] dark:text-[color:color-mix(in_srgb,var(--list-color)_60%,white)]"
    >
      {board.icon ? <span aria-hidden="true">{board.icon}</span> : null}
      <span className="truncate">{board.name}</span>
    </span>
  )
}
