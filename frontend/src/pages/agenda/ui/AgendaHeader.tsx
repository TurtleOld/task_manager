import { Link } from 'react-router-dom'
import { ChipButton } from '@/components/ui'
import { cn } from '@/lib/utils'
import type { AgendaViewMode } from '../lib/grouping'
import { QuickAddBar } from './QuickAddBar'
import type { QuickAddResult } from './QuickAddBar'
import type { QuickAddPerson } from '../lib/quickAdd'

const VIEW_MODE_OPTIONS: { id: AgendaViewMode; label: string }[] = [
  { id: 'today', label: 'Сегодня' },
  { id: 'week', label: 'Неделя' },
  { id: 'all', label: 'Все дела' },
  { id: 'completed', label: 'Выполнено' },
]

export interface AgendaPeopleOption {
  id: number
  name: string
  initial: string
}

export interface AgendaScopeOption {
  id: number
  name: string
  icon?: string
}

interface AgendaQuickAddProps {
  busy: boolean
  onSubmit: (result: QuickAddResult) => void
  people: QuickAddPerson[]
  timeZone?: string | null
}

interface AgendaHeaderProps {
  activeAssigneeId: number | null
  activeListId: number | null
  lists: AgendaScopeOption[]
  people: AgendaPeopleOption[]
  onAssigneeFilterChange: (id: number | null) => void
  onViewModeChange: (mode: AgendaViewMode) => void
  quickAdd: AgendaQuickAddProps | null
  viewMode: AgendaViewMode
}

export function AgendaHeader({
  activeAssigneeId,
  activeListId,
  lists,
  people,
  onAssigneeFilterChange,
  onViewModeChange,
  quickAdd,
  viewMode,
}: AgendaHeaderProps) {
  return (
    <header className="sticky top-16 z-sticky flex min-h-14 flex-wrap items-center gap-3 border-b border-border/80 bg-background/78 px-4 py-2 backdrop-blur-xl sm:flex-nowrap sm:py-0 sm:px-6">
      <div className="order-0 flex shrink-0 items-center gap-1 py-1" role="group" aria-label="Вид агенды">
        {VIEW_MODE_OPTIONS.map((option) => (
          <ChipButton
            key={option.id}
            active={viewMode === option.id}
            tone="primary"
            onClick={() => onViewModeChange(option.id)}
          >
            {option.label}
          </ChipButton>
        ))}
      </div>

      <div
        className={cn(
          'order-1 flex min-w-0 shrink-0 items-center gap-1 overflow-x-auto py-1 lg:hidden',
          !quickAdd && 'flex-1',
        )}
      >
        <ScopeChip active={activeListId == null} label="Все списки" to="/today" />
        {lists.map((list) => (
          <ScopeChip
            key={list.id}
            active={activeListId === list.id}
            icon={list.icon}
            label={list.name}
            to={`/lists/${list.id}`}
          />
        ))}
      </div>

      {quickAdd ? (
        <div className="order-3 flex w-full min-w-0 overflow-x-auto sm:order-2 sm:w-auto sm:flex-1">
          <QuickAddBar
            busy={quickAdd.busy}
            onSubmit={quickAdd.onSubmit}
            people={quickAdd.people}
            timeZone={quickAdd.timeZone}
          />
        </div>
      ) : null}

      {people.length > 0 ? (
        <div className="order-2 flex shrink-0 items-center gap-1 sm:order-3" role="group" aria-label="Фильтр по исполнителю">
          {people.map((person) => {
            const active = activeAssigneeId === person.id
            return (
              <button
                key={person.id}
                type="button"
                aria-pressed={active}
                aria-label={`Фильтр по исполнителю: ${person.name}`}
                title={person.name}
                onClick={() => onAssigneeFilterChange(active ? null : person.id)}
                className={cn(
                  'flex h-9 w-9 items-center justify-center rounded-full bg-primary/12 text-caption font-bold text-primary transition duration-fast ease-standard compact:h-8 compact:w-8',
                  'hover:bg-primary/18',
                  active && 'bg-primary text-text-inverse ring-2 ring-primary/30',
                )}
              >
                {person.initial}
              </button>
            )
          })}
        </div>
      ) : null}
    </header>
  )
}

interface ScopeChipProps {
  active: boolean
  icon?: string
  label: string
  to: string
}

function ScopeChip({ active, icon, label, to }: ScopeChipProps) {
  return (
    <Link
      to={to}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 text-caption text-text-muted transition duration-fast ease-standard compact:h-8',
        'hover:border-primary/40 hover:text-text',
        active && 'border-primary/40 bg-primary/12 text-primary',
      )}
    >
      {icon ? <span aria-hidden="true">{icon}</span> : null}
      <span className="whitespace-nowrap">{label}</span>
    </Link>
  )
}
