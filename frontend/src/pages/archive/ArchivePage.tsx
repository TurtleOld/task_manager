import { useState } from 'react'
import { toast } from 'sonner'
import { useBoards } from '../../api/queries/boards'
import { useArchive, useRestoreArchiveCard, useRestoreArchiveColumn } from '../../api/queries/cards'
import type { ArchivedCard, ArchivedColumn } from '../../api/types'
import { priorityToLabel, priorityToMarker, priorityToTone } from '../board/lib/priority'
import { Badge, Button, Card as SurfaceCard, Chip, EmptyState, ErrorState, PageShell, Select, Skeleton } from '@/components/ui'

export function ArchivePage() {
  const { data: boards = [], isLoading: boardsLoading } = useBoards()
  const [boardFilter, setBoardFilter] = useState('all')
  const selectedBoardId = boardFilter === 'all' ? undefined : Number(boardFilter)
  const { data, isLoading: archiveLoading, isError, refetch } = useArchive(selectedBoardId)
  const restoreCard = useRestoreArchiveCard(selectedBoardId)
  const restoreColumn = useRestoreArchiveColumn(selectedBoardId)
  const [restoringKey, setRestoringKey] = useState<string | null>(null)

  const cards = data?.cards ?? []
  const columns = data?.columns ?? []
  const totalCount = cards.length + columns.length
  const isLoading = boardsLoading || archiveLoading

  const restoreArchivedCard = async (card: ArchivedCard) => {
    setRestoringKey(`card-${card.id}`)
    try {
      await restoreCard.mutateAsync(card.id)
      toast.success('Задача восстановлена')
    } catch (error) {
      toast.error((error as Error).message || 'Не удалось восстановить задачу')
    } finally {
      setRestoringKey(null)
    }
  }

  const restoreArchivedColumn = async (column: ArchivedColumn) => {
    setRestoringKey(`column-${column.id}`)
    try {
      await restoreColumn.mutateAsync(column.id)
      toast.success('Колонка восстановлена')
    } catch (error) {
      toast.error((error as Error).message || 'Не удалось восстановить колонку')
    } finally {
      setRestoringKey(null)
    }
  }

  if (isLoading) return <ArchivePageSkeleton />

  if (isError) {
    return (
      <PageShell width="2xl" spacing="md">
        <ErrorState action={{ label: 'Повторить', onClick: () => void refetch() }}>
          Не удалось загрузить архив.
        </ErrorState>
      </PageShell>
    )
  }

  return (
    <PageShell width="2xl" spacing="md">
      <header className="rounded-[1.6rem] border border-border/80 bg-[image:var(--gradient-surface)] p-6 shadow-elevated backdrop-blur lg:p-7">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="primary">T-205</Badge>
              <Badge variant="success">Архив</Badge>
            </div>
            <div>
              <h1 className="text-h1 text-text">Архив задач и колонок</h1>
              <p className="mt-2 max-w-3xl text-body-sm text-text-muted">
                Удаление теперь не стирает данные. Архивированные элементы скрываются с досок и могут быть восстановлены.
              </p>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3 lg:min-w-[30rem]">
            <ArchiveMetric label="Всего" value={totalCount} tone="primary" />
            <ArchiveMetric label="Задач" value={cards.length} tone="warning" />
            <ArchiveMetric label="Колонок" value={columns.length} tone="success" />
          </div>
        </div>
      </header>

      <SurfaceCard as="section" className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-h3 text-text">Фильтр архива</h2>
            <p className="mt-1 text-body-sm text-text-muted">Можно смотреть весь архив или элементы одной доски.</p>
          </div>
          <label className="min-w-56">
            <span className="sr-only">Фильтр по доске</span>
            <Select value={boardFilter} onChange={(event) => setBoardFilter(event.target.value)}>
              <option value="all">Все доски</option>
              {boards.map((board) => <option key={board.id} value={board.id}>{board.name}</option>)}
            </Select>
          </label>
        </div>
      </SurfaceCard>

      {totalCount === 0 ? (
        <EmptyState title="Архив пуст">
          Здесь появятся задачи и колонки после архивирования.
        </EmptyState>
      ) : null}

      <SurfaceCard as="section" className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="warning">Задачи</Badge>
          <Badge>{cards.length} items</Badge>
        </div>
        {cards.length === 0 ? (
          <EmptyState title="Архивированных задач нет" className="p-4 text-left" />
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            {cards.map((card) => (
              <ArchivedCardItem
                key={card.id}
                card={card}
                restoring={restoringKey === `card-${card.id}`}
                onRestore={() => void restoreArchivedCard(card)}
              />
            ))}
          </div>
        )}
      </SurfaceCard>

      <SurfaceCard as="section" className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="success">Колонки</Badge>
          <Badge>{columns.length} items</Badge>
        </div>
        {columns.length === 0 ? (
          <EmptyState title="Архивированных колонок нет" className="p-4 text-left" />
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            {columns.map((column) => (
              <ArchivedColumnItem
                key={column.id}
                column={column}
                restoring={restoringKey === `column-${column.id}`}
                onRestore={() => void restoreArchivedColumn(column)}
              />
            ))}
          </div>
        )}
      </SurfaceCard>
    </PageShell>
  )
}

function ArchivedCardItem({ card, restoring, onRestore }: { card: ArchivedCard; restoring: boolean; onRestore: () => void }) {
  const priorityTone = priorityToTone(card.priority)
  return (
    <article className="rounded-[1.2rem] border border-border/75 bg-surface/90 p-4 shadow-surface backdrop-blur">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Chip tone={priorityTone} active>{priorityToMarker(card.priority)} {priorityToLabel(card.priority)}</Chip>
            <Chip>{card.board_name}</Chip>
            <Chip>{card.column_name}</Chip>
          </div>
          <h3 className="mt-3 text-h3 text-text">{card.title}</h3>
          {card.description ? <p className="mt-2 line-clamp-3 text-body-sm text-text-muted">{card.description}</p> : null}
          <p className="mt-3 text-caption text-text-muted">В архиве с {formatDateTime(card.archived_at)}</p>
        </div>
        <Button type="button" variant="secondary" size="sm" loading={restoring} disabled={restoring} onClick={onRestore} className="shrink-0">
          Восстановить
        </Button>
      </div>
    </article>
  )
}

function ArchivedColumnItem({ column, restoring, onRestore }: { column: ArchivedColumn; restoring: boolean; onRestore: () => void }) {
  return (
    <article className="rounded-[1.2rem] border border-border/75 bg-surface/90 p-4 shadow-surface backdrop-blur">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Chip active>{column.icon || '📦'} {column.board_name}</Chip>
            {column.is_done ? <Chip tone="success" active>Done</Chip> : null}
          </div>
          <h3 className="mt-3 text-h3 text-text">{column.name}</h3>
          <p className="mt-3 text-caption text-text-muted">В архиве с {formatDateTime(column.archived_at)}</p>
        </div>
        <Button type="button" variant="secondary" size="sm" loading={restoring} disabled={restoring} onClick={onRestore} className="shrink-0">
          Восстановить
        </Button>
      </div>
    </article>
  )
}

function ArchiveMetric({ label, value, tone }: { label: string; value: number; tone: 'primary' | 'success' | 'warning' }) {
  const valueClass = tone === 'success' ? 'text-success' : tone === 'warning' ? 'text-warning' : 'text-primary'
  return (
    <div className="rounded-[1.15rem] border border-border/70 bg-background-subtle/65 p-4">
      <p className="text-caption uppercase tracking-[0.08em] text-text-muted">{label}</p>
      <p className={`mt-1 text-h2 ${valueClass}`}>{value}</p>
    </div>
  )
}

function formatDateTime(value: string | null) {
  if (!value) return 'неизвестно'
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

function ArchivePageSkeleton() {
  return (
    <PageShell width="2xl" spacing="md" aria-busy="true" aria-label="Загрузка архива">
      <header className="rounded-[1.6rem] border border-border/80 bg-[image:var(--gradient-surface)] p-6 shadow-elevated backdrop-blur lg:p-7">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-4">
            <div className="flex gap-2">
              <Skeleton className="h-6 w-20 rounded-full" />
              <Skeleton className="h-6 w-20 rounded-full" />
            </div>
            <Skeleton className="h-10 w-72" />
            <Skeleton className="h-4 w-full max-w-2xl" />
            <Skeleton className="h-4 w-2/3 max-w-xl" />
          </div>
          <div className="grid gap-3 sm:grid-cols-3 lg:min-w-[30rem]">
            <Skeleton className="h-24 rounded-[1.15rem]" />
            <Skeleton className="h-24 rounded-[1.15rem]" />
            <Skeleton className="h-24 rounded-[1.15rem]" />
          </div>
        </div>
      </header>
      {Array.from({ length: 3 }).map((_, sectionIndex) => (
        <SurfaceCard key={sectionIndex} as="section" className="space-y-4">
          <Skeleton className="h-6 w-32 rounded-full" />
          <div className="grid gap-3 lg:grid-cols-2">
            <Skeleton className="h-36 rounded-[1.2rem]" />
            <Skeleton className="h-36 rounded-[1.2rem]" />
          </div>
        </SurfaceCard>
      ))}
    </PageShell>
  )
}
