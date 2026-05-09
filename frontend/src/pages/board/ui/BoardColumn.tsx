import { Badge, Chip, EmptyState, IconButton, TextInput } from '../../../shared/ui'
import type { Card, Column } from '../../../api/types'

interface PriorityView {
  label: string
  marker: string
  tone: 'danger' | 'success' | 'warning'
}

interface BoardColumnProps {
  column: Column
  accentClass: string
  cards: Card[]
  newCardTitle: string
  onNewCardTitleChange: (value: string) => void
  onCreateCard: () => void
  onDrop: () => void
  onCardOpen: (card: Card) => void
  onDragStart: (card: Card) => void
  onDragEnd: () => void
  priorityFor: (card: Card) => PriorityView
  tagsFor: (card: Card) => string[]
  categoriesFor: (card: Card) => string[]
  deadlineFor: (card: Card) => string
  assigneeNameFor: (card: Card) => string | null
  formatDateTime: (value: string) => string
  formatUpdatedStatus: (value: string) => string
  move: (card: Card, dir: 'up' | 'down' | 'left' | 'right') => Promise<void>
  stopCardOpen: (event: { preventDefault: () => void; stopPropagation: () => void }) => void
  stopCardKeyBubble: (event: { stopPropagation: () => void }) => void
}

export function BoardColumn({
  column,
  accentClass,
  cards,
  newCardTitle,
  onNewCardTitleChange,
  onCreateCard,
  onDrop,
  onCardOpen,
  onDragStart,
  onDragEnd,
  priorityFor,
  tagsFor,
  categoriesFor,
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

  return (
    <div
      className="flex h-full flex-col rounded-panel border border-border bg-surface-elevated/80 p-4 shadow-surface backdrop-blur transition-colors duration-fast ease-standard"
      onDragOver={(event) => event.preventDefault()}
      onDrop={onDrop}
      aria-label={`Колонка ${displayName || 'Без названия'}`}
    >
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            {displayIcon ? <span className="text-xl" aria-hidden="true">{displayIcon}</span> : null}
            <h2 className={`text-h3 ${accentClass}`}>{displayName}</h2>
          </div>
        </div>
        <Badge>{cards.length} задач</Badge>
      </div>

      <div className="mt-4 flex items-center gap-2">
        <label className="flex-1">
          <span className="sr-only">Новая карточка</span>
          <TextInput placeholder="Название задачи" value={newCardTitle} onChange={(e) => onNewCardTitleChange(e.target.value)} />
        </label>
        <IconButton onClick={onCreateCard} variant="primary" aria-label={`Добавить карточку в ${displayName || 'колонку'}`}>+</IconButton>
      </div>

      <ul className="mt-4 space-y-4" aria-label={`Карточки ${displayName || 'колонки'}`}>
        {cards.length === 0 ? (
          <li>
            <EmptyState title="Нет задач" className="p-4 text-left">Создайте первую задачу в этой колонке.</EmptyState>
          </li>
        ) : null}
        {cards.map((card) => {
          const priority = priorityFor(card)
          const tags = tagsFor(card)
          const categories = categoriesFor(card)
          const deadline = deadlineFor(card)
          const assigneeName = assigneeNameFor(card)

          return (
            <li
              key={card.id}
              className="group rounded-panel border border-border bg-surface p-4 shadow-surface transition duration-fast ease-standard hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-elevated"
              draggable
              onDragStart={() => onDragStart(card)}
              onDragEnd={onDragEnd}
            >
              <button type="button" onClick={() => onCardOpen(card)} className="block w-full rounded-control text-left" aria-label={`Открыть задачу ${card.title}`}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-body-sm font-semibold text-text">{card.title}</h3>
                    <p className="mt-2 line-clamp-3 text-caption text-text-muted">{card.description}</p>
                  </div>
                  <Chip tone={priority.tone} active>{priority.marker} {priority.label}</Chip>
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  {tags.map((tag) => <Chip key={tag} tone="primary">{tag}</Chip>)}
                  {categories.map((category) => <Chip key={category} tone="success">{category}</Chip>)}
                </div>

                {deadline ? <div className="mt-3 flex flex-wrap gap-2"><Chip tone="warning">⏰ {formatDateTime(deadline)}</Chip></div> : null}

                {assigneeName ? (
                  <div className="mt-3 flex items-center gap-1.5 text-caption text-text-muted">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-caption font-bold text-primary">
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
                <div className="flex items-center gap-1 md:hidden">
                  <IconButton
                    type="button"
                    onClick={(event) => { stopCardOpen(event); void move(card, 'up') }}
                    onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') stopCardKeyBubble(event) }}
                    className="min-h-8 min-w-8"
                    aria-label="Поднять карточку"
                  >↑</IconButton>
                  <IconButton
                    type="button"
                    onClick={(event) => { stopCardOpen(event); void move(card, 'down') }}
                    onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') stopCardKeyBubble(event) }}
                    className="min-h-8 min-w-8"
                    aria-label="Опустить карточку"
                  >↓</IconButton>
                  <IconButton
                    type="button"
                    onClick={(event) => { stopCardOpen(event); void move(card, 'left') }}
                    onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') stopCardKeyBubble(event) }}
                    className="min-h-8 min-w-8"
                    aria-label="Переместить влево"
                  >←</IconButton>
                  <IconButton
                    type="button"
                    onClick={(event) => { stopCardOpen(event); void move(card, 'right') }}
                    onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') stopCardKeyBubble(event) }}
                    className="min-h-8 min-w-8"
                    aria-label="Переместить вправо"
                  >→</IconButton>
                </div>
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
