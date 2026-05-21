import { Badge, Card as SurfaceCard, Checkbox, ChipButton, Field, TextInput } from '@/components/ui'
import type { BoardLabel } from '../types'

interface BoardFiltersProps {
  activeFilterCount: number
  searchQuery: string
  onSearchQueryChange: (value: string) => void
  labelOptions: BoardLabel[]
  activeLabel: string
  onActiveLabelChange: (value: string) => void
  showFutureCards: boolean
  onShowFutureCardsChange: (value: boolean) => void
  hiddenFutureCardsCount: number
}

export function BoardFilters({
  activeFilterCount,
  searchQuery,
  onSearchQueryChange,
  labelOptions,
  activeLabel,
  onActiveLabelChange,
  showFutureCards,
  onShowFutureCardsChange,
  hiddenFutureCardsCount,
}: BoardFiltersProps) {
  return (
    <SurfaceCard as="section" className="overflow-hidden border-primary/10">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h2 className="text-h3 text-text">Поиск и фильтры</h2>
          <p className="mt-1 text-body-sm text-text-muted">Быстро находите задачи по названию, описанию или тегу.</p>
        </div>
        <Badge variant={activeFilterCount ? 'primary' : 'neutral'}>Активных фильтров: {activeFilterCount}</Badge>
      </div>
      <div className="mt-5 grid gap-5">
        <Field label="Поиск" htmlFor="board-task-search">
          <TextInput
            id="board-task-search"
            value={searchQuery}
            onChange={(event) => onSearchQueryChange(event.target.value)}
            placeholder="Найдите задачу по названию, описанию или тегу"
          />
        </Field>
        <Checkbox
          id="board-show-future-cards"
          checked={showFutureCards}
          onChange={(event) => onShowFutureCardsChange(event.currentTarget.checked)}
          label="Показывать дальние задачи"
          description={hiddenFutureCardsCount > 0 ? `Скрыто до недели перед дедлайном: ${hiddenFutureCardsCount}` : 'Задачи с дедлайном дальше недели скрываются по умолчанию.'}
          className="border-border/70 bg-background-subtle/55"
        />
        <div className="rounded-panel border border-border/70 bg-background-subtle/55 p-4">
          <p className="text-label uppercase text-text-muted">Теги</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <ChipButton
              active={activeLabel === 'Все'}
              onClick={() => onActiveLabelChange('Все')}
            >
              Все
            </ChipButton>
            {labelOptions.map((label) => (
              <ChipButton
                key={label.name}
                active={activeLabel === label.name}
                onClick={() => onActiveLabelChange(label.name)}
                style={
                  activeLabel === label.name
                    ? { borderColor: label.color, backgroundColor: `${label.color}1a`, color: label.color }
                    : { borderColor: `${label.color}66`, color: label.color }
                }
              >
                {label.name}
              </ChipButton>
            ))}
          </div>
        </div>
      </div>
    </SurfaceCard>
  )
}
