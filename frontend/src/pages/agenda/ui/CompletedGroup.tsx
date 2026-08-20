import { useId, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import type { AgendaBoundaries, AgendaCard, Board } from '../../../api/types'
import type { CompletedDayGroup } from '../lib/completedGrouping'
import { cn } from '@/lib/utils'
import { AgendaRow } from './AgendaRow'

interface CompletedGroupProps {
  boardsById: Map<number, Board>
  boundaries: AgendaBoundaries
  busy: boolean
  deadlineBusy: boolean
  group: CompletedDayGroup
  onCompleteToggle: (card: AgendaCard, complete: boolean) => void
  onDeadlineCommit: (card: AgendaCard, deadline: string | null) => void
}

export function CompletedGroup({ boardsById, boundaries, busy, deadlineBusy, group, onCompleteToggle, onDeadlineCommit }: CompletedGroupProps) {
  const contentId = useId()
  const [collapsed, setCollapsed] = useState(false)
  const noop = () => {}

  return (
    <section className="space-y-0.5" aria-label={group.label}>
      <h2>
        <button
          type="button"
          aria-expanded={!collapsed}
          aria-controls={contentId}
          onClick={() => setCollapsed((prev) => !prev)}
          className="flex h-10 w-full items-center gap-2 rounded-control px-3 text-left transition hover:bg-surface-hover compact:h-9"
        >
          <ChevronDown
            className={cn('h-4 w-4 shrink-0 text-text-muted transition-transform duration-fast ease-standard', collapsed && '-rotate-90')}
            aria-hidden="true"
          />
          <span className="text-body-sm font-semibold text-text">{group.label}</span>
          <span className="ml-auto rounded-full bg-background-subtle px-2 py-0.5 text-caption text-text-muted">{group.cards.length}</span>
        </button>
      </h2>
      {!collapsed ? (
        <ul id={contentId} className="space-y-0.5">
          {group.cards.map((card) => (
            <AgendaRow
              key={card.id}
              boundaries={boundaries}
              busy={busy}
              card={card}
              deadlineBusy={deadlineBusy}
              group="later"
              listMeta={boardsById.get(card.list)}
              onCompleteToggle={onCompleteToggle}
              onDeadlineCommit={onDeadlineCommit}
              onSwipeComplete={noop}
              onSwipeTomorrow={noop}
            />
          ))}
        </ul>
      ) : null}
    </section>
  )
}
