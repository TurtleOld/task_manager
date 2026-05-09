import { Badge, Card as SurfaceCard, ChipButton, Field, TextInput } from '../../../shared/ui'

interface BoardFiltersProps {
  activeFilterCount: number
  searchQuery: string
  onSearchQueryChange: (value: string) => void
  tagOptions: string[]
  activeTag: string
  onActiveTagChange: (value: string) => void
  categoryOptions: string[]
  activeCategory: string
  onActiveCategoryChange: (value: string) => void
}

export function BoardFilters({
  activeFilterCount,
  searchQuery,
  onSearchQueryChange,
  tagOptions,
  activeTag,
  onActiveTagChange,
  categoryOptions,
  activeCategory,
  onActiveCategoryChange,
}: BoardFiltersProps) {
  return (
    <SurfaceCard as="section" className="overflow-hidden border-primary/10">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h2 className="text-h3 text-text">Поиск и фильтры</h2>
          <p className="mt-1 text-body-sm text-text-muted">Быстро находите задачи по названию, описанию, тегам и категориям.</p>
        </div>
        <Badge variant={activeFilterCount ? 'primary' : 'neutral'}>Активных фильтров: {activeFilterCount}</Badge>
      </div>
      <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_1fr]">
        <Field label="Поиск" htmlFor="board-task-search" className="lg:col-span-2">
          <TextInput
            id="board-task-search"
            value={searchQuery}
            onChange={(event) => onSearchQueryChange(event.target.value)}
            placeholder="Найдите задачу по названию, описанию, тегу или категории"
          />
        </Field>
        <div className="rounded-panel border border-border/70 bg-background-subtle/55 p-4">
          <p className="text-label uppercase text-text-muted">Теги</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {tagOptions.map((tag) => (
              <ChipButton key={tag} active={activeTag === tag} tone="primary" onClick={() => onActiveTagChange(tag)}>
                {tag}
              </ChipButton>
            ))}
          </div>
        </div>
        <div className="rounded-panel border border-border/70 bg-background-subtle/55 p-4">
          <p className="text-label uppercase text-text-muted">Категории</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {categoryOptions.map((category) => (
              <ChipButton key={category} active={activeCategory === category} tone="success" onClick={() => onActiveCategoryChange(category)}>
                {category}
              </ChipButton>
            ))}
          </div>
        </div>
      </div>
    </SurfaceCard>
  )
}
