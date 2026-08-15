import { Link } from 'react-router-dom'
import { cn } from '@/lib/utils'

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

interface AgendaHeaderProps {
  activeAssigneeId: number | null
  activeListId: number | null
  lists: AgendaScopeOption[]
  people: AgendaPeopleOption[]
  onAssigneeFilterChange: (id: number | null) => void
}

export function AgendaHeader({
  activeAssigneeId,
  activeListId,
  lists,
  people,
  onAssigneeFilterChange,
}: AgendaHeaderProps) {
  return (
    <header className="sticky top-16 z-sticky flex h-14 items-center gap-3 border-b border-border/80 bg-background/78 px-4 backdrop-blur-xl sm:px-6">
      <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto py-1">
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

      {people.length > 0 ? (
        <div className="flex shrink-0 items-center gap-1" role="group" aria-label="Фильтр по исполнителю">
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
