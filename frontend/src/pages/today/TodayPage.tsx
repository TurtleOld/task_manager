import { useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { useCompleteTodayCard, useMyToday } from '../../api/queries/cards'
import type { MyTodayCard } from '../../api/types'
import { formatTaskCount } from '../../shared/lib/formatTaskCount'
import { priorityToLabel, priorityToMarker, priorityToTone } from '../board/lib/priority'
import { Badge, Button, Card as SurfaceCard, Chip, EmptyState, ErrorState, PageShell, Skeleton } from '@/components/ui'

type SectionTone = 'danger' | 'warning' | 'primary'

interface TodaySectionProps {
  cards: MyTodayCard[]
  description: string
  emptyText: string
  onComplete: (card: MyTodayCard) => void
  pendingCardId: number | null
  title: string
  tone: SectionTone
}

const sectionVariant: Record<SectionTone, 'danger' | 'warning' | 'primary'> = {
  danger: 'danger',
  warning: 'warning',
  primary: 'primary',
}

export function TodayPage() {
  const { data, isLoading, isError, refetch } = useMyToday()
  const completeMutation = useCompleteTodayCard()
  const [pendingCardId, setPendingCardId] = useState<number | null>(null)

  const overdueCards = data?.overdue ?? []
  const todayCards = data?.today ?? []
  const importantCards = data?.important ?? []
  const totalCount = overdueCards.length + todayCards.length + importantCards.length

  const completeCard = async (card: MyTodayCard) => {
    if (!card.done_column) {
      toast.error('На доске нет колонки для завершённых задач')
      return
    }

    setPendingCardId(card.id)
    try {
      await completeMutation.mutateAsync({ card, doneColumn: card.done_column })
      toast.success('Задача завершена')
    } catch {
      toast.error('Не удалось завершить задачу')
    } finally {
      setPendingCardId(null)
    }
  }

  if (isLoading) return <TodayPageSkeleton />

  if (isError) {
    return (
      <PageShell width="2xl" spacing="md">
        <ErrorState action={{ label: 'Повторить', onClick: () => void refetch() }}>
          Не удалось загрузить задачи на сегодня.
        </ErrorState>
      </PageShell>
    )
  }

  return (
    <PageShell width="2xl" spacing="md">
      <header className="overflow-hidden rounded-[1.6rem] border border-border/80 bg-[image:var(--gradient-surface)] shadow-elevated backdrop-blur">
        <div className="grid gap-6 p-6 lg:grid-cols-[1.2fr_0.8fr] lg:p-7">
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="success">Мой день</Badge>
            </div>
            <div>
              <h1 className="text-h1 text-text">Фокус на сегодня</h1>
              <p className="mt-2 max-w-3xl text-body-sm text-text-muted">
                Просроченные, сегодняшние и срочные задачи собраны в одном месте, чтобы быстро понять приоритеты дня.
              </p>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
            <TodayMetric label="Всего в фокусе" value={totalCount} tone="primary" />
            <TodayMetric label="Просрочено" value={overdueCards.length} tone="danger" />
            <TodayMetric label="Сегодня" value={todayCards.length} tone="warning" />
          </div>
        </div>
      </header>

      {totalCount === 0 ? (
        <EmptyState title="На сегодня всё спокойно">
          Нет просроченных, сегодняшних или срочных задач в активных колонках.
        </EmptyState>
      ) : null}

      <TodaySection
        title="Просрочено"
        description="Задачи с дедлайном раньше сегодняшнего дня. Их стоит разобрать первыми."
        emptyText="Просроченных задач нет."
        tone="danger"
        cards={overdueCards}
        pendingCardId={pendingCardId}
        onComplete={completeCard}
      />
      <TodaySection
        title="Сегодня"
        description="Задачи, дедлайн которых попадает на текущий день."
        emptyText="На сегодня задач с дедлайном нет."
        tone="warning"
        cards={todayCards}
        pendingCardId={pendingCardId}
        onComplete={completeCard}
      />
      <TodaySection
        title="Важное"
        description="Срочные задачи без привязки к дате или с отдельным высоким приоритетом."
        emptyText="Срочных задач нет."
        tone="primary"
        cards={importantCards}
        pendingCardId={pendingCardId}
        onComplete={completeCard}
      />
    </PageShell>
  )
}

function TodayMetric({ label, value, tone }: { label: string; value: number; tone: 'primary' | 'danger' | 'warning' }) {
  const valueClass = tone === 'danger' ? 'text-danger' : tone === 'warning' ? 'text-warning' : 'text-primary'
  return (
    <div className="rounded-[1.15rem] border border-border/70 bg-background-subtle/65 p-4">
      <p className="text-caption uppercase tracking-[0.08em] text-text-muted">{label}</p>
      <p className={`mt-1 text-h2 ${valueClass}`}>{value}</p>
    </div>
  )
}

function TodaySection({ cards, description, emptyText, onComplete, pendingCardId, title, tone }: TodaySectionProps) {
  return (
    <SurfaceCard as="section" className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={sectionVariant[tone]}>{title}</Badge>
            <Badge className="whitespace-nowrap">{formatTaskCount(cards.length)}</Badge>
          </div>
          <p className="mt-2 text-body-sm text-text-muted">{description}</p>
        </div>
      </div>

      {cards.length === 0 ? (
        <EmptyState title={emptyText} className="p-4 text-left" />
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {cards.map((card) => (
            <TodayCard key={card.id} card={card} onComplete={onComplete} pending={pendingCardId === card.id} />
          ))}
        </div>
      )}
    </SurfaceCard>
  )
}

function TodayCard({ card, onComplete, pending }: { card: MyTodayCard; onComplete: (card: MyTodayCard) => void; pending: boolean }) {
  const priorityTone = priorityToTone(card.priority)
  const deadline = formatDateTime(card.deadline)
  const canComplete = Boolean(card.done_column)

  return (
    <article className="rounded-[1.2rem] border border-border/75 bg-surface/90 p-4 shadow-surface backdrop-blur transition duration-fast ease-standard hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-elevated">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Chip tone={priorityTone} active>{priorityToMarker(card.priority)} {priorityToLabel(card.priority)}</Chip>
            <Chip>{card.board_name}</Chip>
            <Chip>{card.column_name}</Chip>
          </div>
          <Link to={`/boards/${card.board}/cards/${card.id}`} className="mt-3 block rounded-control text-h3 text-text transition hover:text-primary">
            {card.title}
          </Link>
          {card.description ? <p className="mt-2 line-clamp-2 text-body-sm text-text-muted">{card.description}</p> : null}
          {deadline ? <p className="mt-3 text-caption text-text-muted">Дедлайн: <span className="font-semibold text-text">{deadline}</span></p> : null}
        </div>

        <Button
          type="button"
          variant={canComplete ? 'secondary' : 'ghost'}
          size="sm"
          loading={pending}
          disabled={!canComplete || pending}
          onClick={() => onComplete(card)}
          title={canComplete ? 'Переместить задачу в done-колонку' : 'На доске нет done-колонки'}
          className="shrink-0"
        >
          Завершить
        </Button>
      </div>
    </article>
  )
}

function formatDateTime(value: string | null) {
  if (!value) return ''
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value
  return parsed.toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function TodayPageSkeleton() {
  return (
    <PageShell width="2xl" spacing="md" aria-busy="true" aria-label="Загрузка задач на сегодня">
      <header className="rounded-[1.6rem] border border-border/80 bg-[image:var(--gradient-surface)] p-6 shadow-elevated backdrop-blur lg:p-7">
        <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="space-y-4">
            <div className="flex gap-2">
              <Skeleton className="h-6 w-20 rounded-full" />
              <Skeleton className="h-6 w-24 rounded-full" />
            </div>
            <Skeleton className="h-10 w-64" />
            <Skeleton className="h-4 w-full max-w-2xl" />
            <Skeleton className="h-4 w-2/3 max-w-xl" />
          </div>
          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
            <Skeleton className="h-24 rounded-[1.15rem]" />
            <Skeleton className="h-24 rounded-[1.15rem]" />
            <Skeleton className="h-24 rounded-[1.15rem]" />
          </div>
        </div>
      </header>

      {Array.from({ length: 3 }).map((_, sectionIndex) => (
        <SurfaceCard key={sectionIndex} as="section" className="space-y-4">
          <div className="space-y-3">
            <div className="flex gap-2">
              <Skeleton className="h-6 w-24 rounded-full" />
              <Skeleton className="h-6 w-16 rounded-full" />
            </div>
            <Skeleton className="h-4 w-96 max-w-full" />
          </div>
          <div className="grid gap-3 lg:grid-cols-2">
            {Array.from({ length: 2 }).map((_, cardIndex) => (
              <Skeleton key={cardIndex} className="h-40 rounded-[1.2rem]" />
            ))}
          </div>
        </SurfaceCard>
      ))}
    </PageShell>
  )
}
