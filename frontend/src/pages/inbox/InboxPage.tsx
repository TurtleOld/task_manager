import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { useBoards } from '../../api/queries/boards'
import { useColumns } from '../../api/queries/columns'
import { useCreateInboxCard, useInbox, useMoveInboxCard } from '../../api/queries/cards'
import type { Card } from '../../api/types'
import { formatTaskCount } from '../../shared/lib/formatTaskCount'
import { priorityToLabel, priorityToMarker, priorityToTone } from '../board/lib/priority'
import { Badge, Button, Card as SurfaceCard, Chip, EmptyState, ErrorState, Field, PageShell, Select, Skeleton, TextInput, Textarea } from '@/components/ui'

export function InboxPage() {
  const { data: inbox, isLoading: inboxLoading, isError: inboxError, refetch: refetchInbox } = useInbox()
  const { data: boards = [], isLoading: boardsLoading } = useBoards()
  const createInboxCard = useCreateInboxCard()
  const moveInboxCard = useMoveInboxCard()

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [targetBoardId, setTargetBoardId] = useState(0)
  const [targetColumnId, setTargetColumnId] = useState(0)
  const [movingCardId, setMovingCardId] = useState<number | null>(null)
  const { data: targetColumns = [], isLoading: columnsLoading } = useColumns(targetBoardId)

  const cards = inbox?.cards ?? []
  const isLoading = inboxLoading || boardsLoading

  useEffect(() => {
    if (targetBoardId || boards.length === 0) return
    const firstBoard = boards[0]
    if (firstBoard) setTargetBoardId(firstBoard.id)
  }, [boards, targetBoardId])

  useEffect(() => {
    const firstColumn = targetColumns[0]
    if (!firstColumn) {
      setTargetColumnId(0)
      return
    }
    if (!targetColumns.some((column) => column.id === targetColumnId)) {
      setTargetColumnId(firstColumn.id)
    }
  }, [targetColumnId, targetColumns])

  const targetBoard = useMemo(
    () => boards.find((board) => board.id === targetBoardId) ?? null,
    [boards, targetBoardId],
  )
  const targetColumn = useMemo(
    () => targetColumns.find((column) => column.id === targetColumnId) ?? null,
    [targetColumnId, targetColumns],
  )

  const submitInboxCard = async () => {
    const trimmedTitle = title.trim()
    if (!trimmedTitle) return

    try {
      await createInboxCard.mutateAsync({
        title: trimmedTitle,
        description: description.trim(),
      })
      setTitle('')
      setDescription('')
      toast.success('Задача добавлена в Inbox')
    } catch {
      toast.error('Не удалось добавить задачу')
    }
  }

  const moveCard = async (card: Card) => {
    if (!targetColumnId) {
      toast.error('Выберите колонку для переноса')
      return
    }

    setMovingCardId(card.id)
    try {
      await moveInboxCard.mutateAsync({ id: card.id, toColumn: targetColumnId })
      toast.success('Задача перенесена')
    } catch {
      toast.error('Не удалось перенести задачу')
    } finally {
      setMovingCardId(null)
    }
  }

  if (isLoading) return <InboxPageSkeleton />

  if (inboxError) {
    return (
      <PageShell width="2xl" spacing="md">
        <ErrorState action={{ label: 'Повторить', onClick: () => void refetchInbox() }}>
          Не удалось загрузить Inbox.
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

              <Badge variant="success">Inbox</Badge>
            </div>
            <div>
              <h1 className="text-h1 text-text">Быстрый сбор задач</h1>
              <p className="mt-2 max-w-3xl text-body-sm text-text-muted">
                Сбрасывайте сюда задачи без выбора доски. Позже разложите их по нужным доскам и колонкам одним действием.
              </p>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:min-w-[22rem]">
            <InboxMetric label="В Inbox" value={cards.length} tone="primary" />
            <InboxMetric label="Досок для сортировки" value={boards.length} tone="success" />
          </div>
        </div>
      </header>

      <section className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
        <SurfaceCard as="section" className="space-y-4 border-primary/15">
          <div>
            <Badge variant="primary">Быстро добавить</Badge>
            <h2 className="mt-3 text-h3 text-text">Новая задача в Inbox</h2>
            <p className="mt-1 text-body-sm text-text-muted">Доску и колонку можно выбрать позже.</p>
          </div>
          <Field label="Название" htmlFor="inbox-title">
            <TextInput
              id="inbox-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Например: купить батарейки"
              onKeyDown={(event) => {
                if (event.key === 'Enter') void submitInboxCard()
              }}
            />
          </Field>
          <Field label="Заметка" htmlFor="inbox-description">
            <Textarea
              id="inbox-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Дополнительный контекст, если нужен"
              rows={4}
            />
          </Field>
          <Button
            type="button"
            onClick={submitInboxCard}
            loading={createInboxCard.isPending}
            disabled={!title.trim() || createInboxCard.isPending}
          >
            Добавить в Inbox
          </Button>
        </SurfaceCard>

        <SurfaceCard as="section" className="space-y-4">
          <div>
            <Badge variant="warning">Куда переносить</Badge>
            <h2 className="mt-3 text-h3 text-text">Целевая доска и колонка</h2>
            <p className="mt-1 text-body-sm text-text-muted">Выберите направление, затем нажмите «Перенести» у нужной задачи.</p>
          </div>

          {boards.length === 0 ? (
            <EmptyState title="Нет обычных досок" className="p-4 text-left">
              Создайте доску, чтобы раскладывать задачи из Inbox.
            </EmptyState>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              <Field label="Доска" htmlFor="inbox-target-board">
                <Select
                  id="inbox-target-board"
                  value={targetBoardId || ''}
                  onChange={(event) => setTargetBoardId(Number(event.target.value))}
                >
                  {boards.map((board) => <option key={board.id} value={board.id}>{board.name}</option>)}
                </Select>
              </Field>
              <Field label="Колонка" htmlFor="inbox-target-column">
                <Select
                  id="inbox-target-column"
                  value={targetColumnId || ''}
                  onChange={(event) => setTargetColumnId(Number(event.target.value))}
                  disabled={columnsLoading || targetColumns.length === 0}
                >
                  {targetColumns.map((column) => <option key={column.id} value={column.id}>{column.name}</option>)}
                </Select>
              </Field>
            </div>
          )}

          {targetBoard && targetColumn ? (
            <div className="rounded-[1.15rem] border border-border/70 bg-background-subtle/65 p-4 text-body-sm text-text-muted">
              Текущая цель: <span className="font-semibold text-text">{targetBoard.name}</span> → <span className="font-semibold text-text">{targetColumn.name}</span>
            </div>
          ) : null}
        </SurfaceCard>
      </section>

      <SurfaceCard as="section" className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="primary">Неразобранное</Badge>
              <Badge className="whitespace-nowrap">{formatTaskCount(cards.length)}</Badge>
            </div>
            <p className="mt-2 text-body-sm text-text-muted">Задачи из системной Inbox-доски не отображаются в общем списке досок.</p>
          </div>
        </div>

        {cards.length === 0 ? (
          <EmptyState title="Inbox пуст">
            Здесь появятся задачи, которые вы добавите без выбора доски.
          </EmptyState>
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            {cards.map((card) => (
              <InboxTaskCard
                key={card.id}
                card={card}
                canMove={Boolean(targetColumnId)}
                moving={movingCardId === card.id}
                onMove={() => void moveCard(card)}
              />
            ))}
          </div>
        )}
      </SurfaceCard>
    </PageShell>
  )
}

function InboxTaskCard({ card, canMove, moving, onMove }: { card: Card; canMove: boolean; moving: boolean; onMove: () => void }) {
  const priorityTone = priorityToTone(card.priority)
  return (
    <article className="rounded-[1.2rem] border border-border/75 bg-surface/90 p-4 shadow-surface backdrop-blur transition duration-fast ease-standard hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-elevated">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Chip tone={priorityTone} active>{priorityToMarker(card.priority)} {priorityToLabel(card.priority)}</Chip>
            <Chip>Inbox</Chip>
          </div>
          <Link to={`/boards/${card.board}/cards/${card.id}`} className="mt-3 block rounded-control text-h3 text-text transition hover:text-primary">
            {card.title}
          </Link>
          {card.description ? <p className="mt-2 line-clamp-3 text-body-sm text-text-muted">{card.description}</p> : null}
        </div>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={onMove}
          loading={moving}
          disabled={!canMove || moving}
          className="shrink-0"
        >
          Перенести
        </Button>
      </div>
    </article>
  )
}

function InboxMetric({ label, value, tone }: { label: string; value: number; tone: 'primary' | 'success' }) {
  const valueClass = tone === 'success' ? 'text-success' : 'text-primary'
  return (
    <div className="rounded-[1.15rem] border border-border/70 bg-background-subtle/65 p-4">
      <p className="text-caption uppercase tracking-[0.08em] text-text-muted">{label}</p>
      <p className={`mt-1 text-h2 ${valueClass}`}>{value}</p>
    </div>
  )
}

function InboxPageSkeleton() {
  return (
    <PageShell width="2xl" spacing="md" aria-busy="true" aria-label="Загрузка Inbox">
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
          <div className="grid gap-3 sm:grid-cols-2 lg:min-w-[22rem]">
            <Skeleton className="h-24 rounded-[1.15rem]" />
            <Skeleton className="h-24 rounded-[1.15rem]" />
          </div>
        </div>
      </header>

      <section className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
        <SurfaceCard as="section" className="space-y-4">
          <Skeleton className="h-6 w-32 rounded-full" />
          <Skeleton className="h-8 w-56" />
          <Skeleton className="h-11 rounded-control" />
          <Skeleton className="h-28 rounded-control" />
          <Skeleton className="h-11 w-40 rounded-control" />
        </SurfaceCard>
        <SurfaceCard as="section" className="space-y-4">
          <Skeleton className="h-6 w-32 rounded-full" />
          <Skeleton className="h-8 w-64" />
          <div className="grid gap-3 md:grid-cols-2">
            <Skeleton className="h-11 rounded-control" />
            <Skeleton className="h-11 rounded-control" />
          </div>
          <Skeleton className="h-20 rounded-[1.15rem]" />
        </SurfaceCard>
      </section>

      <SurfaceCard as="section" className="space-y-4">
        <Skeleton className="h-6 w-40 rounded-full" />
        <div className="grid gap-3 lg:grid-cols-2">
          {Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} className="h-36 rounded-[1.2rem]" />)}
        </div>
      </SurfaceCard>
    </PageShell>
  )
}
