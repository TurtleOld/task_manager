import { CSS } from '@dnd-kit/utilities'
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { cn } from '@/lib/utils'
import { Badge, Chip, EmptyState, IconButton, TextInput } from '@/components/ui'
import type { Card, Column } from '../../../api/types'
import type { BoardLabel } from '../types'

interface PriorityView {
  label: string
  marker: string
  tone: 'danger' | 'success' | 'warning' | 'neutral'
}

interface BoardColumnProps {
  column: Column
  accentClass: string
  cards: Card[]
  newCardTitle: string
  onNewCardTitleChange: (value: string) => void
  onCreateCard: () => void
  parsedQuickAddDeadline?: string
  parsedQuickAddTitle?: string
  onDismissParsedDeadline?: () => void
  onCardOpen: (card: Card) => void
  priorityFor: (card: Card) => PriorityView
  labelsFor: (card: Card) => BoardLabel[]
  deadlineFor: (card: Card) => string
  assigneeNameFor: (card: Card) => string | null
  formatDateTime: (value: string) => string
  formatUpdatedStatus: (value: string) => string
  move: (card: Card, dir: 'up' | 'down' | 'left' | 'right') => Promise<void>
  stopCardOpen: (event: { preventDefault: () => void; stopPropagation: () => void }) => void
  stopCardKeyBubble: (event: { stopPropagation: () => void }) => void
}

interface BoardTaskCardProps {
  card: Card
  priorityFor: (card: Card) => PriorityView
  labelsFor: (card: Card) => BoardLabel[]
  deadlineFor: (card: Card) => string
  assigneeNameFor: (card: Card) => string | null
  formatDateTime: (value: string) => string
  formatUpdatedStatus: (value: string) => string
  move?: (card: Card, dir: 'up' | 'down' | 'left' | 'right') => Promise<void>
  onCardOpen?: (card: Card) => void
  stopCardOpen?: (event: { preventDefault: () => void; stopPropagation: () => void }) => void
  stopCardKeyBubble?: (event: { stopPropagation: () => void }) => void
  overlay?: boolean
}

export function BoardColumn({
  column,
  accentClass,
  cards,
  newCardTitle,
  onNewCardTitleChange,
  onCreateCard,
  parsedQuickAddDeadline,
  parsedQuickAddTitle,
  onDismissParsedDeadline,
  onCardOpen,
  priorityFor,
  labelsFor,
  deadlineFor,
  assigneeNameFor,
  formatDateTime,
  formatUpdatedStatus,
  move,
  stopCardOpen,
  stopCardKeyBubble,
}: BoardColumnProps) {
  const displayName = column.name?.trim() ? column.name : ''
  const displayIcon = column.icon?.trim() ? column.icon : ''
  const {
    attributes,
    listeners,
    setActivatorNodeRef,
    setNodeRef,
    transform,
    transition,
    isDragging,
    isOver,
  } = useSortable({ id: `column-${column.id}` })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'flex h-full flex-col rounded-[1.4rem] border border-border/80 bg-[image:var(--gradient-surface)] p-4 shadow-surface backdrop-blur transition duration-fast ease-standard hover:border-border-strong',
        isOver && 'border-primary/40 ring-2 ring-primary/15',
        isDragging && 'opacity-50',
      )}
      aria-label={`Колонка ${displayName || 'Без названия'}`}
    >
      <div className="flex items-center justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <button
              type="button"
              ref={setActivatorNodeRef}
              className="flex h-10 w-8 shrink-0 touch-none items-center justify-center rounded-control border border-border/70 bg-background-subtle/65 text-text-muted transition hover:border-primary/30 hover:text-primary"
              aria-label={`Перетащить колонку ${displayName || 'Без названия'}`}
              {...attributes}
              {...listeners}
            >
              ⋮⋮
            </button>
            {displayIcon ? <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-background-subtle text-xl shadow-surface" aria-hidden="true">{displayIcon}</span> : null}
            <h2 className={`truncate text-h3 ${accentClass}`}>{displayName}</h2>
          </div>
        </div>
        <Badge>{cards.length} задач</Badge>
      </div>

      <div className="mt-5 rounded-panel border border-border/70 bg-background-subtle/60 p-2">
        <div className="flex items-center gap-2">
          <label className="flex-1">
            <span className="sr-only">Новая карточка</span>
            <TextInput placeholder="Название задачи" value={newCardTitle} onChange={(e) => onNewCardTitleChange(e.target.value)} />
          </label>
          <IconButton onClick={onCreateCard} variant="primary" aria-label={`Добавить карточку в ${displayName || 'колонку'}`}>+</IconButton>
        </div>
        {parsedQuickAddDeadline ? (
          <div className="mt-2 flex flex-wrap items-center gap-2 rounded-control border border-primary/20 bg-primary/10 px-3 py-2 text-caption text-primary">
            <span>Распознан дедлайн: {parsedQuickAddDeadline}</span>
            {parsedQuickAddTitle ? <span className="text-text-muted">→ {parsedQuickAddTitle}</span> : null}
            {onDismissParsedDeadline ? (
              <button type="button" onClick={onDismissParsedDeadline} className="font-semibold text-primary hover:text-primary-hover">
                отменить
              </button>
            ) : null}
          </div>
        ) : null}
      </div>

      <SortableContext items={cards.map((card) => `card-${card.id}`)} strategy={verticalListSortingStrategy}>
        <ul className="mt-4 space-y-4" aria-label={`Карточки ${displayName || 'колонки'}`}>
          {cards.length === 0 ? (
            <li>
              <EmptyState title="Нет задач" className="p-4 text-left">Создайте первую задачу в этой колонке.</EmptyState>
            </li>
          ) : null}
          {cards.map((card) => (
            <SortableBoardTaskCard
              key={card.id}
              card={card}
              priorityFor={priorityFor}
              labelsFor={labelsFor}
              deadlineFor={deadlineFor}
              assigneeNameFor={assigneeNameFor}
              formatDateTime={formatDateTime}
              formatUpdatedStatus={formatUpdatedStatus}
              move={move}
              onCardOpen={onCardOpen}
              stopCardOpen={stopCardOpen}
              stopCardKeyBubble={stopCardKeyBubble}
            />
          ))}
        </ul>
      </SortableContext>
    </div>
  )
}

function SortableBoardTaskCard(props: BoardTaskCardProps) {
  const { card } = props
  const disabled = card.id < 0
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: `card-${card.id}`,
    disabled,
  })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={cn(isDragging && 'opacity-40')}
      {...attributes}
      {...listeners}
    >
      <BoardTaskCard {...props} />
    </li>
  )
}

export function BoardTaskCard({
  card,
  priorityFor,
  labelsFor,
  deadlineFor,
  assigneeNameFor,
  formatDateTime,
  formatUpdatedStatus,
  move,
  onCardOpen,
  stopCardOpen,
  stopCardKeyBubble,
  overlay = false,
}: BoardTaskCardProps) {
  const priority = priorityFor(card)
  const labels = labelsFor(card)
  const deadline = deadlineFor(card)
  const assigneeName = assigneeNameFor(card)
  const subtasks = card.subtasks ?? []
  const doneSubtasks = subtasks.filter((item) => item.is_done).length

  return (
    <div
      className={cn(
        'group rounded-[1.15rem] border border-border/75 bg-surface/90 p-4 shadow-surface backdrop-blur transition duration-fast ease-standard hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-elevated',
        overlay && 'rotate-1 cursor-grabbing border-primary/35 shadow-elevated',
      )}
    >
      <button type="button" onClick={() => onCardOpen?.(card)} className="block w-full rounded-control text-left" aria-label={`Открыть задачу ${card.title}`}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-body-sm font-semibold text-text">{card.title}</h3>
            <p className="mt-2 line-clamp-3 text-caption text-text-muted">{card.description}</p>
          </div>
          <Chip tone={priority.tone} active>{priority.marker} {priority.label}</Chip>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          {labels.map((label) => (
            <Chip key={label.name} style={{ borderColor: label.color, backgroundColor: `${label.color}1a`, color: label.color }}>
              {label.name}
            </Chip>
          ))}
        </div>

        {deadline ? <div className="mt-3 flex flex-wrap gap-2"><Chip tone="warning">⏰ {formatDateTime(deadline)}</Chip></div> : null}

        {subtasks.length > 0 ? (
          <div className="mt-3 flex flex-wrap gap-2">
            <Chip tone={doneSubtasks === subtasks.length ? 'success' : 'neutral'}>↳ {doneSubtasks}/{subtasks.length}</Chip>
          </div>
        ) : null}

        {assigneeName ? (
          <div className="mt-3 flex items-center gap-1.5 text-caption text-text-muted">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/12 text-caption font-bold text-primary">
              {assigneeName[0]?.toUpperCase()}
            </span>
            <span>{assigneeName}</span>
          </div>
        ) : null}
      </button>

      <div className="mt-3 flex items-center justify-between text-caption text-text-muted">
        <span className="inline-flex items-center gap-1">
          <span className="h-1.5 w-1.5 rounded-full bg-success" aria-hidden="true" />
          {formatUpdatedStatus(card.updated_at)}
        </span>
        {move && stopCardOpen && stopCardKeyBubble ? (
          <div className="flex items-center gap-1 md:hidden">
            <IconButton type="button" onClick={(event) => { stopCardOpen(event); void move(card, 'up') }} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') stopCardKeyBubble(event) }} className="min-h-8 min-w-8" aria-label="Поднять карточку">↑</IconButton>
            <IconButton type="button" onClick={(event) => { stopCardOpen(event); void move(card, 'down') }} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') stopCardKeyBubble(event) }} className="min-h-8 min-w-8" aria-label="Опустить карточку">↓</IconButton>
            <IconButton type="button" onClick={(event) => { stopCardOpen(event); void move(card, 'left') }} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') stopCardKeyBubble(event) }} className="min-h-8 min-w-8" aria-label="Переместить влево">←</IconButton>
            <IconButton type="button" onClick={(event) => { stopCardOpen(event); void move(card, 'right') }} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') stopCardKeyBubble(event) }} className="min-h-8 min-w-8" aria-label="Переместить вправо">→</IconButton>
          </div>
        ) : null}
      </div>
    </div>
  )
}
