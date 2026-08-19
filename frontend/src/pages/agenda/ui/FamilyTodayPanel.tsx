import { Card as SurfaceCard, Checkbox, ProgressBar, Skeleton } from '@/components/ui'
import { cn } from '@/lib/utils'
import type { FamilyShoppingList, FamilyTodayPerson, FamilyTodayResponse, FamilyWeekProgress } from '../../../api/types'

interface FamilyTodayPanelProps {
  data: FamilyTodayResponse | undefined
  isLoading: boolean
  isError: boolean
  activeAssigneeId: number | null
  onPersonClick: (userId: number) => void
  onShoppingItemToggle: (itemId: number, done: boolean) => void
  shoppingBusy: boolean
}

// Ошибку загрузки панель проглатывает молча — агенда остаётся рабочей и без неё.
export function FamilyTodayPanel({
  data,
  isLoading,
  isError,
  activeAssigneeId,
  onPersonClick,
  onShoppingItemToggle,
  shoppingBusy,
}: FamilyTodayPanelProps) {
  if (isLoading) return <FamilyTodayPanelSkeleton />
  if (isError || !data) return null

  return (
    <div className="space-y-4">
      <FamilyPeopleCard people={data.people} activeAssigneeId={activeAssigneeId} onPersonClick={onPersonClick} />
      {data.shopping_list ? (
        <FamilyShoppingCard
          shoppingList={data.shopping_list}
          busy={shoppingBusy}
          onToggle={onShoppingItemToggle}
        />
      ) : null}
      <FamilyWeekProgressCard week={data.week} />
    </div>
  )
}

function FamilyPeopleCard({
  people,
  activeAssigneeId,
  onPersonClick,
}: {
  people: FamilyTodayPerson[]
  activeAssigneeId: number | null
  onPersonClick: (userId: number) => void
}) {
  return (
    <SurfaceCard as="section" className="space-y-3" aria-label="Сегодня у семьи">
      <h2 className="text-body-sm font-semibold text-text">Сегодня у семьи</h2>
      {people.length === 0 ? (
        <p className="text-caption text-text-muted">На сегодня ни у кого нет задач.</p>
      ) : (
        <ul className="space-y-1">
          {people.map((person) => {
            const name = person.user.full_name || person.user.username || 'Без имени'
            const active = activeAssigneeId === person.user.id
            const percent = person.today_total > 0 ? Math.floor((person.today_completed / person.today_total) * 100) : 0
            return (
              <li key={person.user.id}>
                <button
                  type="button"
                  aria-pressed={active}
                  onClick={() => onPersonClick(person.user.id)}
                  className={cn(
                    'flex w-full items-center gap-2.5 rounded-control px-2 py-1.5 text-left transition duration-fast ease-standard hover:bg-surface-hover',
                    active && 'bg-primary/12',
                  )}
                >
                  <span
                    className={cn(
                      'flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/12 text-caption font-bold text-primary',
                      active && 'bg-primary text-text-inverse',
                    )}
                    aria-hidden="true"
                  >
                    {name[0]?.toUpperCase() ?? '?'}
                  </span>
                  <span className="min-w-0 flex-1 space-y-1">
                    <span className="flex items-center justify-between gap-2">
                      <span className="min-w-0 flex-1 truncate text-body-sm text-text">{name}</span>
                      <span className="shrink-0 text-caption text-text-muted">
                        {person.today_completed}/{person.today_total} дел
                      </span>
                    </span>
                    <ProgressBar percent={percent} />
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </SurfaceCard>
  )
}

function FamilyShoppingCard({
  shoppingList,
  busy,
  onToggle,
}: {
  shoppingList: FamilyShoppingList
  busy: boolean
  onToggle: (itemId: number, done: boolean) => void
}) {
  const doneCount = shoppingList.items.filter((item) => item.done).length

  return (
    <SurfaceCard as="section" className="space-y-3" aria-label="Список покупок">
      <div className="flex items-center justify-between">
        <h2 className="text-body-sm font-semibold text-text">Список покупок</h2>
        <span className="rounded-full bg-background-subtle px-2 py-0.5 text-caption text-text-muted">
          {doneCount}/{shoppingList.items.length}
        </span>
      </div>
      {shoppingList.items.length === 0 ? (
        <p className="text-caption text-text-muted">Пока пусто.</p>
      ) : (
        <ul className="space-y-1.5">
          {shoppingList.items.map((item) => (
            <li key={item.id}>
              <Checkbox
                label={<span className={item.done ? 'line-through opacity-70' : ''}>{item.text}</span>}
                checked={item.done}
                disabled={busy}
                onChange={() => onToggle(item.id, !item.done)}
                className="border-transparent bg-transparent px-0 py-0 shadow-none hover:bg-transparent"
              />
            </li>
          ))}
        </ul>
      )}
    </SurfaceCard>
  )
}

function FamilyWeekProgressCard({ week }: { week: FamilyWeekProgress }) {
  const percent = week.total > 0 ? Math.floor((week.completed / week.total) * 100) : 0

  return (
    <SurfaceCard as="section" className="space-y-2" aria-label="Прогресс недели">
      <h2 className="text-body-sm font-semibold text-text">Прогресс недели</h2>
      <p className="text-caption text-text-muted">
        {week.completed} из {week.total} · {percent}%
      </p>
      <ProgressBar percent={percent} tone="success" />
    </SurfaceCard>
  )
}

function FamilyTodayPanelSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Загрузка панели «Сегодня у семьи»">
      {Array.from({ length: 3 }).map((_, index) => (
        <SurfaceCard key={index} as="section" className="space-y-3">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
        </SurfaceCard>
      ))}
    </div>
  )
}
