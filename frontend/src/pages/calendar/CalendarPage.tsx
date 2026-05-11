import { useEffect, useMemo, useRef, useState } from 'react'
import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/daygrid'
import timeGridPlugin from '@fullcalendar/timegrid'
import interactionPlugin from '@fullcalendar/interaction'
import type { Card } from '../../api/types'
import { useBoards } from '../../api/queries/boards'
import { useColumns } from '../../api/queries/columns'
import { useCalendarCards, useCreateCalendarCard, useUpdateCalendarCard } from '../../api/queries/cards'
import { Badge, Button, Card as SurfaceCard, EmptyState, ErrorState, Field, PageShell, Select, Skeleton, TextInput } from '@/components/ui'
import { Link, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'

type CalendarView = 'dayGridMonth' | 'timeGridWeek' | 'timeGridDay'

type SelectedSlot = {
  allDay: boolean
  start: Date
}

const viewLabels: Array<{ label: string; value: CalendarView }> = [
  { label: 'Месяц', value: 'dayGridMonth' },
  { label: 'Неделя', value: 'timeGridWeek' },
  { label: 'День', value: 'timeGridDay' },
]

const boardPalette = [
  '#2563eb',
  '#7c3aed',
  '#dc2626',
  '#16a34a',
  '#d97706',
  '#0891b2',
  '#db2777',
  '#4f46e5',
]

export function CalendarPage() {
  const calendarRef = useRef<FullCalendar | null>(null)
  const navigate = useNavigate()
  const { data: boards = [], isLoading: boardsLoading, isError: boardsError, refetch: refetchBoards } = useBoards()
  const { data: cards = [], isLoading: cardsLoading, isError: cardsError, refetch: refetchCards } = useCalendarCards()
  const updateCardMutation = useUpdateCalendarCard()
  const createCardMutation = useCreateCalendarCard()

  const [activeView, setActiveView] = useState<CalendarView>('dayGridMonth')
  const [calendarTitle, setCalendarTitle] = useState('')
  const [boardFilter, setBoardFilter] = useState('all')
  const [selectedSlot, setSelectedSlot] = useState<SelectedSlot | null>(null)
  const [newCardTitle, setNewCardTitle] = useState('')
  const [newCardBoardId, setNewCardBoardId] = useState(0)
  const [newCardColumnId, setNewCardColumnId] = useState(0)
  const { data: newCardColumns = [], isLoading: columnsLoading } = useColumns(newCardBoardId)

  const isLoading = boardsLoading || cardsLoading
  const isError = boardsError || cardsError

  useEffect(() => {
    if (newCardBoardId || boards.length === 0) return
    const firstBoard = boards[0]
    if (firstBoard) setNewCardBoardId(firstBoard.id)
  }, [boards, newCardBoardId])

  useEffect(() => {
    const firstColumn = newCardColumns[0]
    if (!firstColumn) {
      setNewCardColumnId(0)
      return
    }
    if (!newCardColumns.some((column) => column.id === newCardColumnId)) {
      setNewCardColumnId(firstColumn.id)
    }
  }, [newCardColumnId, newCardColumns])

  const boardsById = useMemo(() => new Map(boards.map((board) => [board.id, board])), [boards])
  const visibleCards = useMemo(() => {
    if (boardFilter === 'all') return cards
    const boardId = Number(boardFilter)
    return cards.filter((card) => card.board === boardId)
  }, [boardFilter, cards])

  const calendarEvents = useMemo(() => visibleCards.map((card) => {
    const board = boardsById.get(card.board)
    const color = colorForBoard(card.board)
    return {
      id: String(card.id),
      title: card.title,
      start: card.deadline ?? undefined,
      backgroundColor: color,
      borderColor: color,
      extendedProps: {
        boardName: board?.name ?? `Доска #${card.board}`,
        card,
      },
    }
  }), [boardsById, visibleCards])

  const datedCardsCount = cards.length
  const activeBoardCount = new Set(cards.map((card) => card.board)).size
  const todayCardsCount = cards.filter((card) => isToday(card.deadline)).length

  const changeView = (view: CalendarView) => {
    setActiveView(view)
    calendarRef.current?.getApi().changeView(view)
  }

  const moveCalendar = (direction: 'prev' | 'next' | 'today') => {
    const api = calendarRef.current?.getApi()
    if (!api) return
    if (direction === 'prev') api.prev()
    else if (direction === 'next') api.next()
    else api.today()
    setCalendarTitle(api.view.title)
  }

  const updateDroppedDeadline = async (card: Card, nextStart: Date | null, revert: () => void) => {
    if (!card.deadline || !nextStart) {
      revert()
      return
    }

    const nextDeadline = withOriginalTime(card.deadline, nextStart).toISOString()
    try {
      await updateCardMutation.mutateAsync({ id: card.id, payload: { deadline: nextDeadline } })
      toast.success('Дата задачи обновлена')
    } catch {
      revert()
      toast.error('Не удалось обновить дату задачи')
    }
  }

  const createCardFromSlot = async () => {
    const title = newCardTitle.trim()
    if (!selectedSlot || !title || !newCardColumnId) return

    try {
      const card = await createCardMutation.mutateAsync({
        column: newCardColumnId,
        title,
        deadline: deadlineForSlot(selectedSlot).toISOString(),
      })
      toast.success('Задача добавлена в календарь')
      setSelectedSlot(null)
      setNewCardTitle('')
      navigate(`/boards/${card.board}/cards/${card.id}`)
    } catch {
      toast.error('Не удалось создать задачу')
    }
  }

  if (isLoading) return <CalendarPageSkeleton />

  if (isError) {
    return (
      <PageShell width="2xl" spacing="md">
        <ErrorState action={{ label: 'Повторить', onClick: () => { void refetchBoards(); void refetchCards() } }}>
          Не удалось загрузить календарь задач.
        </ErrorState>
      </PageShell>
    )
  }

  return (
    <PageShell width="2xl" spacing="md">
      <header className="rounded-[1.6rem] border border-border/80 bg-[image:var(--gradient-surface)] p-6 shadow-elevated backdrop-blur lg:p-7">
        <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="success">Календарь</Badge>
            </div>
            <div>
              <h1 className="text-h1 text-text">Календарь задач</h1>
              <p className="mt-2 max-w-3xl text-body-sm text-text-muted">
                Дедлайны по всем доскам в месячном, недельном и дневном виде. Перетаскивание меняет день дедлайна, сохраняя исходное время задачи.
              </p>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3 xl:min-w-[28rem]">
            <CalendarMetric label="С дедлайном" value={datedCardsCount} tone="primary" />
            <CalendarMetric label="Сегодня" value={todayCardsCount} tone="warning" />
            <CalendarMetric label="Досок" value={activeBoardCount} tone="success" />
          </div>
        </div>
      </header>

      <SurfaceCard as="section" className="space-y-4">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={() => moveCalendar('prev')} aria-label="Предыдущий период">←</Button>
            <Button type="button" variant="secondary" size="sm" onClick={() => moveCalendar('today')}>Сегодня</Button>
            <Button type="button" variant="secondary" size="sm" onClick={() => moveCalendar('next')} aria-label="Следующий период">→</Button>
            <h2 className="min-w-0 px-2 text-h3 text-text">{calendarTitle || 'Календарь'}</h2>
          </div>

          <div className="flex flex-col gap-3 md:flex-row md:items-center">
            <label className="min-w-48">
              <span className="sr-only">Фильтр по доске</span>
              <Select value={boardFilter} onChange={(event) => setBoardFilter(event.target.value)}>
                <option value="all">Все доски</option>
                {boards.map((board) => <option key={board.id} value={board.id}>{board.name}</option>)}
              </Select>
            </label>
            <div className="flex rounded-control border border-border bg-background-subtle/70 p-1">
              {viewLabels.map((view) => (
                <button
                  key={view.value}
                  type="button"
                  onClick={() => changeView(view.value)}
                  className={`rounded-control px-3 py-2 text-caption font-semibold transition ${activeView === view.value ? 'bg-primary text-text-inverse shadow-surface' : 'text-text-muted hover:bg-surface hover:text-text'}`}
                >
                  {view.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {datedCardsCount === 0 ? (
          <EmptyState title="В календаре пока нет задач">
            Добавьте дедлайн в карточке или кликните по дню, чтобы создать задачу сразу с датой.
          </EmptyState>
        ) : null}

        <div className="overflow-hidden rounded-[1.2rem] border border-border/80 bg-surface p-3 shadow-surface [&_.fc]:font-sans [&_.fc-button]:hidden [&_.fc-daygrid-day-number]:text-text-muted [&_.fc-event]:cursor-pointer [&_.fc-event]:border-0 [&_.fc-event]:px-1.5 [&_.fc-event]:py-0.5 [&_.fc-event]:text-caption [&_.fc-timegrid-slot-label]:text-text-muted [&_.fc-toolbar]:hidden">
          <FullCalendar
            ref={calendarRef}
            plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
            initialView={activeView}
            locale="ru"
            firstDay={1}
            height="auto"
            headerToolbar={false}
            editable
            selectable
            selectMirror
            nowIndicator
            events={calendarEvents}
            eventTimeFormat={{ hour: '2-digit', minute: '2-digit' }}
            slotLabelFormat={{ hour: '2-digit', minute: '2-digit' }}
            datesSet={(info) => setCalendarTitle(info.view.title)}
            select={(info) => {
              setSelectedSlot({ allDay: info.allDay, start: info.start })
              if (boards[0] && !newCardBoardId) setNewCardBoardId(boards[0].id)
            }}
            eventClick={(info) => {
              const card = info.event.extendedProps.card as Card | undefined
              if (card) navigate(`/boards/${card.board}/cards/${card.id}`)
            }}
            eventDrop={(info) => {
              const card = info.event.extendedProps.card as Card | undefined
              if (card) void updateDroppedDeadline(card, info.event.start, info.revert)
            }}
            eventContent={(info) => (
              <div className="min-w-0">
                <div className="truncate font-semibold">{info.event.title}</div>
                <div className="truncate opacity-85">{String(info.event.extendedProps.boardName ?? '')}</div>
              </div>
            )}
          />
        </div>
      </SurfaceCard>

      {selectedSlot ? (
        <SurfaceCard as="section" className="space-y-4 border-primary/20">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <Badge variant="primary">Новая задача</Badge>
              <h2 className="mt-3 text-h3 text-text">Создать задачу на {formatDateTime(deadlineForSlot(selectedSlot))}</h2>
              <p className="mt-1 text-body-sm text-text-muted">Выберите доску и колонку, куда добавить задачу.</p>
            </div>
            <Button type="button" variant="ghost" size="sm" onClick={() => setSelectedSlot(null)}>Закрыть</Button>
          </div>

          <div className="grid gap-3 lg:grid-cols-[1fr_0.8fr_0.8fr_auto] lg:items-end">
            <Field label="Название" htmlFor="calendar-card-title">
              <TextInput
                id="calendar-card-title"
                value={newCardTitle}
                onChange={(event) => setNewCardTitle(event.target.value)}
                placeholder="Например: оплатить счёт"
              />
            </Field>
            <Field label="Доска" htmlFor="calendar-board">
              <Select
                id="calendar-board"
                value={newCardBoardId || ''}
                onChange={(event) => setNewCardBoardId(Number(event.target.value))}
              >
                {boards.map((board) => <option key={board.id} value={board.id}>{board.name}</option>)}
              </Select>
            </Field>
            <Field label="Колонка" htmlFor="calendar-column">
              <Select
                id="calendar-column"
                value={newCardColumnId || ''}
                onChange={(event) => setNewCardColumnId(Number(event.target.value))}
                disabled={columnsLoading || newCardColumns.length === 0}
              >
                {newCardColumns.map((column) => <option key={column.id} value={column.id}>{column.name}</option>)}
              </Select>
            </Field>
            <Button
              type="button"
              onClick={createCardFromSlot}
              loading={createCardMutation.isPending}
              disabled={!newCardTitle.trim() || !newCardColumnId || createCardMutation.isPending}
            >
              Создать
            </Button>
          </div>
        </SurfaceCard>
      ) : null}

      <SurfaceCard as="section" className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-h3 text-text">Легенда досок</h2>
            <p className="mt-1 text-body-sm text-text-muted">Цвет события вычисляется по доске и остаётся стабильным.</p>
          </div>
          <Badge>{boards.length} досок</Badge>
        </div>
        <div className="flex flex-wrap gap-2">
          {boards.map((board) => (
            <Link key={board.id} to={`/boards/${board.id}`} className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-2 text-caption text-text-muted transition hover:border-primary/35 hover:text-primary">
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: colorForBoard(board.id) }} aria-hidden="true" />
              {board.name}
            </Link>
          ))}
        </div>
      </SurfaceCard>
    </PageShell>
  )
}

function CalendarMetric({ label, value, tone }: { label: string; value: number; tone: 'primary' | 'success' | 'warning' }) {
  const valueClass = tone === 'success' ? 'text-success' : tone === 'warning' ? 'text-warning' : 'text-primary'
  return (
    <div className="rounded-[1.15rem] border border-border/70 bg-background-subtle/65 p-4">
      <p className="text-caption uppercase tracking-[0.08em] text-text-muted">{label}</p>
      <p className={`mt-1 text-h2 ${valueClass}`}>{value}</p>
    </div>
  )
}

function colorForBoard(boardId: number) {
  return boardPalette[Math.abs(boardId) % boardPalette.length] ?? boardPalette[0]
}

function deadlineForSlot(slot: SelectedSlot) {
  const deadline = new Date(slot.start)
  if (slot.allDay) deadline.setHours(12, 0, 0, 0)
  return deadline
}

function withOriginalTime(originalIso: string, nextDay: Date) {
  const original = new Date(originalIso)
  const next = new Date(nextDay)
  next.setHours(original.getHours(), original.getMinutes(), original.getSeconds(), original.getMilliseconds())
  return next
}

function isToday(value: string | null) {
  if (!value) return false
  const date = new Date(value)
  const today = new Date()
  return date.getFullYear() === today.getFullYear()
    && date.getMonth() === today.getMonth()
    && date.getDate() === today.getDate()
}

function formatDateTime(value: Date) {
  return value.toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function CalendarPageSkeleton() {
  return (
    <PageShell width="2xl" spacing="md" aria-busy="true" aria-label="Загрузка календаря">
      <header className="rounded-[1.6rem] border border-border/80 bg-[image:var(--gradient-surface)] p-6 shadow-elevated backdrop-blur lg:p-7">
        <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
          <div className="space-y-4">
            <div className="flex gap-2">
              <Skeleton className="h-6 w-20 rounded-full" />
              <Skeleton className="h-6 w-28 rounded-full" />
            </div>
            <Skeleton className="h-10 w-72" />
            <Skeleton className="h-4 w-full max-w-2xl" />
            <Skeleton className="h-4 w-2/3 max-w-xl" />
          </div>
          <div className="grid gap-3 sm:grid-cols-3 xl:min-w-[28rem]">
            <Skeleton className="h-24 rounded-[1.15rem]" />
            <Skeleton className="h-24 rounded-[1.15rem]" />
            <Skeleton className="h-24 rounded-[1.15rem]" />
          </div>
        </div>
      </header>

      <SurfaceCard as="section" className="space-y-4">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <Skeleton className="h-11 w-80 max-w-full rounded-control" />
          <Skeleton className="h-11 w-96 max-w-full rounded-control" />
        </div>
        <Skeleton className="h-[42rem] rounded-[1.2rem]" />
      </SurfaceCard>
    </PageShell>
  )
}
