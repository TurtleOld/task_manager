import { useId } from 'react'
import { AlertTriangle, ChevronDown } from 'lucide-react'
import type { AgendaBoundaries, AgendaCard, Board } from '../../../api/types'
import type { AgendaGroupId } from '../lib/grouping'
import { cn } from '@/lib/utils'
import { AgendaRow } from './AgendaRow'

interface AgendaGroupProps {
  boardsById: Map<number, Board>
  boundaries: AgendaBoundaries
  busy: boolean
  cards: AgendaCard[]
  collapsed: boolean
  deadlineBusy: boolean
  group: AgendaGroupId
  label: string
  onCompleteToggle: (card: AgendaCard, complete: boolean) => void
  onDeadlineCommit: (card: AgendaCard, deadline: string | null) => void
  onSwipeComplete: (card: AgendaCard) => void
  onSwipeTomorrow: (card: AgendaCard) => void
  onToggle: () => void
}

const groupLabelTone: Partial<Record<AgendaGroupId, string>> = {
  overdue: 'text-danger',
  today: 'text-primary',
}

/** «Просрочено» и «Сегодня» — единственные группы, требующие мгновенного узнавания взглядом. */
const emphasizedGroups: Partial<Record<AgendaGroupId, true>> = {
  overdue: true,
  today: true,
}

export function AgendaGroup({ boardsById, boundaries, busy, cards, collapsed, deadlineBusy, group, label, onCompleteToggle, onDeadlineCommit, onSwipeComplete, onSwipeTomorrow, onToggle }: AgendaGroupProps) {
  const contentId = useId()

  if (cards.length === 0) return null

  const isOverdue = group === 'overdue'
  const emphasized = emphasizedGroups[group] === true

  return (
    <section
      className={cn('space-y-0.5', isOverdue && 'rounded-[1.1rem] border border-danger/25 bg-danger/8 p-1')}
      aria-label={label}
    >
      <h2>
        <button
          type="button"
          aria-expanded={!collapsed}
          aria-controls={contentId}
          onClick={onToggle}
          className="flex h-10 w-full items-center gap-2 rounded-control px-3 text-left transition hover:bg-surface-hover compact:h-9"
        >
          <ChevronDown
            className={cn('h-4 w-4 shrink-0 text-text-muted transition-transform duration-fast ease-standard', collapsed && '-rotate-90')}
            aria-hidden="true"
          />
          {isOverdue ? <AlertTriangle className="h-4 w-4 shrink-0 text-danger" aria-hidden="true" /> : null}
          <span
            className={cn(
              'font-semibold',
              emphasized ? 'text-caption uppercase tracking-wide' : 'text-body-sm',
              groupLabelTone[group] ?? 'text-text',
            )}
          >
            {label}
          </span>
          <span
            className={cn(
              'ml-auto rounded-full px-2 py-0.5 text-caption',
              isOverdue ? 'bg-danger font-semibold text-text-inverse' : 'bg-background-subtle text-text-muted',
            )}
          >
            {cards.length}
          </span>
        </button>
      </h2>
      {!collapsed ? (
        <ul id={contentId} className="space-y-0.5">
          {cards.map((card) => (
            <AgendaRow
              key={card.id}
              boundaries={boundaries}
              busy={busy}
              card={card}
              deadlineBusy={deadlineBusy}
              group={group}
              listMeta={boardsById.get(card.list)}
              onCompleteToggle={onCompleteToggle}
              onDeadlineCommit={onDeadlineCommit}
              onSwipeComplete={onSwipeComplete}
              onSwipeTomorrow={onSwipeTomorrow}
            />
          ))}
        </ul>
      ) : null}
    </section>
  )
}
