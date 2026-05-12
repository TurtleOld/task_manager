import { useEffect, useMemo, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  closestCorners,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import { SortableContext, rectSortingStrategy, sortableKeyboardCoordinates } from '@dnd-kit/sortable'
import { api } from '../../api/client'
import { queryKeys } from '../../api/queries/keys'
import { useBoards } from '../../api/queries/boards'
import { useColumns, useCreateColumn, useMoveColumn } from '../../api/queries/columns'
import { useCards, useCreateCard, useMoveCard } from '../../api/queries/cards'
import { AUTH_TOKEN_KEY } from '../../app/auth'
import { getTimeZoneLabel } from '../../shared/lib/timezone'
import { parseTaskInput } from '../../shared/lib/parseTaskInput'
import { Button, Card as SurfaceCard, Field, Select, Skeleton, TextInput } from '@/components/ui'
import { useBoardWebSocket } from '../../useBoardWebSocket'
import type { BoardEvent } from '../../useBoardWebSocket'
import type { AuthUser, Card, Column } from '../../api/types'
import type { AssigneeOption, BoardLabel } from './types'
import { useBoardTaskModal } from './hooks/useBoardTaskModal'
import {
  PRIORITY_HIGH,
  PRIORITY_NORMAL,
  priorityToLabel,
  priorityToMarker,
  priorityToTone,
} from './lib/priority'
import { BoardColumn, BoardTaskCard } from './ui/BoardColumn'
import { BoardFilters } from './ui/BoardFilters'
import { BoardHeader } from './ui/BoardHeader'
import { TaskModal } from './ui/TaskModal'

interface BoardPageProps {
  user: AuthUser
}

export function BoardPage({ user }: BoardPageProps) {
  const params = useParams()
  const navigate = useNavigate()
  const boardId = Number(params.id)
  const routeCardId = params.cardId ?? null
  const queryClient = useQueryClient()
  const pendingCreateCardIdRef = useRef<number | null>(null)

  const { data: cards = [], isLoading: cardsLoading } = useCards(boardId)
  const { data: columns = [], isLoading: columnsLoading } = useColumns(boardId)
  const { data: boards = [] } = useBoards()
  const isBoardLoading = cardsLoading || columnsLoading
  const boardName = useMemo(
    () => boards.find((b) => b.id === boardId)?.name ?? '',
    [boards, boardId],
  )

  const createCardMutation = useCreateCard(boardId)
  const createColumnMutation = useCreateColumn(boardId)
  const moveColumnMutation = useMoveColumn(boardId)
  const moveCardMutation = useMoveCard(boardId)

  const [colName, setColName] = useState('')
  const [colIcon, setColIcon] = useState('📋')
  const [isCreatingColumn, setIsCreatingColumn] = useState(false)
  const [newCardTitle, setNewCardTitle] = useState<Record<number, string>>({})
  const [dismissedQuickAddInput, setDismissedQuickAddInput] = useState<Record<number, string>>({})
  const [activeDragCardId, setActiveDragCardId] = useState<number | null>(null)
  const [activeLabel, setActiveLabel] = useState('Все')
  const [searchQuery, setSearchQuery] = useState('')
  const [assignees, setAssignees] = useState<AssigneeOption[]>([])
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  useEffect(() => {
    if (user?.is_admin) {
      api
        .listUsers()
        .then((users) => {
          setAssignees(users.map((item) => ({ id: item.id, name: item.full_name || item.username })))
        })
        .catch(() => setAssignees([]))
    } else if (user) {
      setAssignees([{ id: user.id, name: user.full_name || user.username }])
    }
  }, [user])

  const wsToken = localStorage.getItem(AUTH_TOKEN_KEY)
  useBoardWebSocket({
    boardId,
    token: wsToken,
    onEvent: (event: BoardEvent) => {
      if (event.type === 'card.created') {
        queryClient.setQueryData<Card[]>(queryKeys.cards(boardId), (prev) => {
          if (!prev) return [event.card]
          if (prev.some((c) => c.id === event.card.id)) return prev
          return [...prev, event.card]
        })
      } else if (event.type === 'card.updated' || event.type === 'card.moved') {
        queryClient.setQueryData<Card[]>(queryKeys.cards(boardId), (prev) =>
          prev?.map((c) => (c.id === event.card.id ? event.card : c)),
        )
      } else if (event.type === 'card.deleted') {
        queryClient.setQueryData<Card[]>(queryKeys.cards(boardId), (prev) =>
          prev?.filter((c) => c.id !== event.card_id),
        )
      } else if (event.type === 'comment.created' || event.type === 'comment.updated' || event.type === 'comment.deleted') {
        window.dispatchEvent(new CustomEvent('board-comment-event', { detail: event }))
      } else if (event.type === 'column.created') {
        queryClient.setQueryData<Column[]>(queryKeys.columns(boardId), (prev) => {
          if (!prev) return [event.column]
          if (prev.some((col) => col.id === event.column.id)) return prev
          return [...prev, event.column]
        })
      } else if (event.type === 'column.updated') {
        queryClient.setQueryData<Column[]>(queryKeys.columns(boardId), (prev) =>
          prev?.map((col) => (col.id === event.column.id ? event.column : col)),
        )
      } else if (event.type === 'column.deleted') {
        queryClient.setQueryData<Column[]>(queryKeys.columns(boardId), (prev) =>
          prev?.filter((col) => col.id !== event.column_id),
        )
      } else if (event.type === 'board.updated') {
        queryClient.setQueryData(queryKeys.boards(), (prev: typeof boards | undefined) =>
          prev?.map((b) => (b.id === event.board.id ? event.board : b)),
        )
      }
    },
  })

  const allKnownLabels = useMemo(() => {
    const map = new Map<string, BoardLabel>()
    for (const card of cards) {
      for (const label of card.labels ?? []) {
        if (!map.has(label.name)) map.set(label.name, label)
      }
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name))
  }, [cards])

  const taskModal = useBoardTaskModal({
    boardId,
    assignees,
    allKnownLabels,
  })
  const setSelectedCard = taskModal.setSelectedCard

  useEffect(() => {
    if (!routeCardId) {
      if (pendingCreateCardIdRef.current == null) setSelectedCard(null)
      return
    }

    const parsedCardId = Number(routeCardId)
    if (!Number.isInteger(parsedCardId) || parsedCardId <= 0) {
      toast.error('Задача не найдена')
      navigate(`/boards/${boardId}`, { replace: true })
      return
    }

    if (isBoardLoading) return

    const routedCard = cards.find((card) => card.id === parsedCardId)
    if (!routedCard) {
      toast.error('Задача не найдена')
      navigate(`/boards/${boardId}`, { replace: true })
      return
    }

    setSelectedCard(routedCard)
  }, [boardId, cards, isBoardLoading, navigate, routeCardId, setSelectedCard])

  const labelsFor = (card: Card) => card.labels ?? []
  const deadlineFor = (card: Card) => card.deadline ?? ''
  const assigneeNameFor = (card: Card) => {
    const assigneeId = card.assignee
    return assigneeId != null ? (assignees.find((u) => u.id === assigneeId)?.name ?? null) : null
  }

  const filteredCards = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    return cards.filter((card) => {
      const labels = card.labels ?? []
      const labelNames = labels.map((label) => label.name)
      const matchesLabel = activeLabel === 'Все' || labelNames.includes(activeLabel)
      const searchable = [card.title, card.description, ...labelNames].join(' ').toLowerCase()
      const matchesSearch = !query || searchable.includes(query)
      return matchesLabel && matchesSearch
    })
  }, [activeLabel, cards, searchQuery])

  const grouped = useMemo(() => {
    const g: Record<number, Card[]> = {}
    for (const c of filteredCards) {
      g[c.column] = g[c.column] ?? []
      g[c.column]?.push(c)
    }
    for (const k of Object.keys(g)) {
      g[Number(k)]?.sort((a, b) => Number(a.position) - Number(b.position) || a.id - b.id)
    }
    return g
  }, [filteredCards])

  if (isBoardLoading) return <BoardPageSkeleton />

  const priorityFor = (card: Card) => ({
    label: priorityToLabel(card.priority),
    marker: priorityToMarker(card.priority),
    tone: priorityToTone(card.priority),
  })

  const formatDateTime = (value: string) => {
    if (!value) return ''
    const parsed = new Date(value)
    if (Number.isNaN(parsed.getTime())) return value
    return parsed.toLocaleString('ru-RU', {
      timeZone: taskModal.profileTimeZone,
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const formatUpdatedStatus = (value: string) => {
    if (!value) return 'Обновлено недавно'
    const parsed = new Date(value)
    if (Number.isNaN(parsed.getTime())) return 'Обновлено недавно'
    const diffMs = Date.now() - parsed.getTime()
    if (diffMs < 60_000) return 'Обновлено недавно'
    return `Обновлено ${formatDateTime(value)}`
  }

  const urgentCardsCount = cards.filter((card) => card.priority === PRIORITY_HIGH).length
  const datedCardsCount = cards.filter((card) => Boolean(deadlineFor(card))).length
  const activeFilterCount = [activeLabel !== 'Все', Boolean(searchQuery.trim())].filter(Boolean).length

  const onCreateColumn = async () => {
    if (!colName.trim()) return
    await createColumnMutation.mutateAsync({ name: colName.trim(), icon: colIcon })
    setColName('')
    setIsCreatingColumn(false)
  }

  const onCreateCard = async (columnId: number) => {
    const rawTitle = (newCardTitle[columnId] || '').trim()
    const quickAdd = quickAddPreviewFor(columnId)
    const title = quickAdd?.title || rawTitle
    if (!title) return
    const deadline = quickAdd?.deadline ?? null

    const tempId = -Date.now()
    const placeholder: Card = {
      id: tempId,
      board: boardId,
      column: columnId,
      parent: null,
      assignee: null,
      title,
      description: '',
      deadline,
      priority: PRIORITY_NORMAL,
      labels: [],
      checklist: [],
      subtasks: [],
      attachments: [],
      position: '999999',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      version: 1,
      archived_at: null,
      is_done: false,
      parent_recurrence: null,
      recurrence: null,
    }
    queryClient.setQueryData<Card[]>(queryKeys.cards(boardId), (prev) =>
      prev ? [...prev, placeholder] : [placeholder],
    )
    pendingCreateCardIdRef.current = tempId
    setSelectedCard(placeholder)
    setNewCardTitle((s) => ({ ...s, [columnId]: '' }))

    try {
      const card = await createCardMutation.mutateAsync({ column: columnId, title, deadline })
      // Replace the placeholder with the persisted card.
      queryClient.setQueryData<Card[]>(queryKeys.cards(boardId), (prev) => {
        if (!prev) return [card]
        const withoutTemp = prev.filter((c) => c.id !== tempId)
        if (withoutTemp.some((c) => c.id === card.id)) return withoutTemp
        return [...withoutTemp, card]
      })
      const shouldOpenPersistedCard = pendingCreateCardIdRef.current === tempId
      pendingCreateCardIdRef.current = null
      setSelectedCard((prev) => (prev?.id === tempId ? card : prev))
      if (shouldOpenPersistedCard) navigate(`/boards/${boardId}/cards/${card.id}`)
    } catch {
      if (pendingCreateCardIdRef.current === tempId) pendingCreateCardIdRef.current = null
      queryClient.setQueryData<Card[]>(queryKeys.cards(boardId), (prev) =>
        prev?.filter((c) => c.id !== tempId),
      )
    }
  }

  const quickAddPreviewFor = (columnId: number) => {
    const input = newCardTitle[columnId] || ''
    if (!input.trim()) return null
    if (dismissedQuickAddInput[columnId] === input) return null
    const parsed = parseTaskInput(input, { timeZone: taskModal.profileTimeZone })
    return parsed.deadline ? parsed : null
  }

  const dismissQuickAddDeadline = (columnId: number) => {
    const input = newCardTitle[columnId] || ''
    setDismissedQuickAddInput((state) => ({ ...state, [columnId]: input }))
  }

  const move = async (card: Card, dir: 'up' | 'down' | 'left' | 'right') => {
    if (dir === 'up' || dir === 'down') {
      const colCards = [...(grouped[card.column] || [])]
      const idx = colCards.findIndex((c) => c.id === card.id)
      if (idx < 0) return
      let before_id: number | undefined
      let after_id: number | undefined
      if (dir === 'up' && idx > 0) {
        const prev = colCards[idx - 1]
        if (prev) after_id = prev.id
      } else if (dir === 'down' && idx < colCards.length - 1) {
        const next = colCards[idx + 1]
        if (next) before_id = next.id
      }

      const swapIdx = dir === 'up' ? idx - 1 : idx + 1
      const swapCard = colCards[swapIdx]
      const optimistic = swapCard
        ? (cs: Card[]) =>
            cs.map((c) => {
              if (c.id === card.id) return { ...c, position: swapCard.position }
              if (c.id === swapCard.id) return { ...c, position: card.position }
              return c
            })
        : undefined

      try {
        await moveCardMutation.mutateAsync({
          id: card.id,
          payload: { before_id, after_id },
          optimistic,
        })
      } catch {
        // useMoveCard rolls back via onError context.
      }
    } else {
      const order = [...columns].sort((a, b) => (a.position > b.position ? 1 : -1))
      const curIdx = order.findIndex((c) => c.id === card.column)
      const target = dir === 'left' ? order[curIdx - 1] : order[curIdx + 1]
      if (!target) return

      try {
        await moveCardMutation.mutateAsync({
          id: card.id,
          payload: { to_column: target.id },
          optimistic: (cs) => cs.map((c) => (c.id === card.id ? { ...c, column: target.id } : c)),
        })
      } catch {
        // rolled back
      }
    }
  }

  const parseDndId = (id: string | number) => {
    const value = String(id)
    const [type, rawId] = value.split('-')
    const numericId = Number(rawId)
    return Number.isFinite(numericId) ? { type, id: numericId } : null
  }

  const positionAfterDrop = (items: Card[], targetColumnId: number, beforeId?: number, afterId?: number) => {
    if (beforeId != null) {
      const before = items.find((item) => item.id === beforeId)
      return String(Number(before?.position ?? 0) + 1)
    }
    if (afterId != null) {
      const after = items.find((item) => item.id === afterId)
      return String(Number(after?.position ?? 0) - 1)
    }
    const last = items
      .filter((item) => item.column === targetColumnId)
      .sort((a, b) => Number(b.position) - Number(a.position))[0]
    return String(Number(last?.position ?? 0) + 1)
  }

  const positionAfterColumnDrop = (items: Column[], beforeId?: number, afterId?: number) => {
    if (beforeId != null) {
      const before = items.find((item) => item.id === beforeId)
      return String(Number(before?.position ?? 0) + 1)
    }
    if (afterId != null) {
      const after = items.find((item) => item.id === afterId)
      return String(Number(after?.position ?? 0) - 1)
    }
    const last = [...items].sort((a, b) => Number(b.position) - Number(a.position))[0]
    return String(Number(last?.position ?? 0) + 1)
  }

  const handleDragStart = (event: DragStartEvent) => {
    const parsed = parseDndId(event.active.id)
    if (parsed?.type === 'card') setActiveDragCardId(parsed.id)
  }

  const handleDragEnd = async (event: DragEndEvent) => {
    setActiveDragCardId(null)
    const active = parseDndId(event.active.id)
    const over = event.over ? parseDndId(event.over.id) : null
    if (!active || !over) return

    if (active.type === 'column') {
      const activeColumn = columns.find((column) => column.id === active.id)
      const overColumnId = over.type === 'column'
        ? over.id
        : over.type === 'card'
          ? cards.find((card) => card.id === over.id)?.column
          : undefined
      const overColumn = columns.find((column) => column.id === overColumnId)
      if (!activeColumn || !overColumn || activeColumn.id === overColumn.id) return

      const oldIndex = sortedColumns.findIndex((column) => column.id === activeColumn.id)
      const newIndex = sortedColumns.findIndex((column) => column.id === overColumn.id)
      if (oldIndex < 0 || newIndex < 0 || oldIndex === newIndex) return
      const before_id = newIndex > oldIndex ? overColumn.id : undefined
      const after_id = newIndex < oldIndex ? overColumn.id : undefined

      try {
        await moveColumnMutation.mutateAsync({
          id: activeColumn.id,
          payload: {
            ...(before_id != null ? { before_id } : {}),
            ...(after_id != null ? { after_id } : {}),
          },
          optimistic: (items) => items.map((item) => (
            item.id === activeColumn.id
              ? { ...item, position: positionAfterColumnDrop(items, before_id, after_id) }
              : item
          )),
        })
      } catch {
        // rollback handled by useMoveColumn onError.
      }
      return
    }

    if (active.type !== 'card') return

    const activeCard = cards.find((card) => card.id === active.id)
    if (!activeCard || activeCard.id < 0) return

    const overCard = over.type === 'card' ? cards.find((card) => card.id === over.id) : null
    const targetColumnId = over.type === 'column' ? over.id : overCard?.column
    if (!targetColumnId) return

    let before_id: number | undefined
    let after_id: number | undefined

    if (overCard && overCard.id !== activeCard.id) {
      if (targetColumnId === activeCard.column) {
        const colCards = grouped[activeCard.column] || []
        const oldIndex = colCards.findIndex((card) => card.id === activeCard.id)
        const newIndex = colCards.findIndex((card) => card.id === overCard.id)
        if (oldIndex < 0 || newIndex < 0 || oldIndex === newIndex) return
        if (newIndex > oldIndex) before_id = overCard.id
        else after_id = overCard.id
      } else {
        after_id = overCard.id
      }
    }

    if (!overCard && targetColumnId === activeCard.column) return

    const payload = {
      ...(targetColumnId !== activeCard.column ? { to_column: targetColumnId } : {}),
      ...(before_id != null ? { before_id } : {}),
      ...(after_id != null ? { after_id } : {}),
    }

    try {
      await moveCardMutation.mutateAsync({
        id: activeCard.id,
        payload,
        optimistic: (items) => items.map((item) => (
          item.id === activeCard.id
            ? { ...item, column: targetColumnId, position: positionAfterDrop(items, targetColumnId, before_id, after_id) }
            : item
        )),
      })
    } catch {
      // rollback handled by useMoveCard onError.
    }
  }

  const handleDragCancel = () => setActiveDragCardId(null)

  const stopCardOpen = (event: { preventDefault: () => void; stopPropagation: () => void }) => {
    event.preventDefault()
    event.stopPropagation()
  }

  const stopCardKeyBubble = (event: { stopPropagation: () => void }) => {
    event.stopPropagation()
  }

  const openTaskModal = (card: Card) => {
    pendingCreateCardIdRef.current = null
    setSelectedCard(card)
    navigate(`/boards/${boardId}/cards/${card.id}`)
  }

  const closeTaskModal = () => {
    pendingCreateCardIdRef.current = null
    setSelectedCard(null)
    navigate(`/boards/${boardId}`)
  }

  const saveAndCloseTaskModal = async () => {
    const shouldClose = await taskModal.onSaveCard()
    if (shouldClose) closeTaskModal()
  }

  const deleteAndCloseTaskModal = async () => {
    const shouldClose = await taskModal.deleteSelectedCard()
    if (shouldClose) closeTaskModal()
  }

  const sortedColumns = [...columns].sort((a, b) => (a.position > b.position ? 1 : -1))
  const activeDragCard = activeDragCardId != null ? cards.find((card) => card.id === activeDragCardId) ?? null : null
  const availableIcons = ['📋', '📝', '⚡', '✅', '🧩', '🛠️', '🎯', '📦', '💡', '🔍']
  const accentClasses = ['text-primary', 'text-warning', 'text-success', 'text-danger', 'text-secondary', 'text-accent']
  const accentForColumn = (index: number) => accentClasses[index % accentClasses.length] ?? 'text-primary'

  return (
    <div className="min-h-screen bg-background pb-12 text-text">
      <BoardHeader boardId={boardId} boardName={boardName} onCreateColumn={() => setIsCreatingColumn(true)} />

      <main className="mx-auto w-full max-w-6xl space-y-6 px-4 pt-6">
        <section className="grid gap-3 sm:grid-cols-3" aria-label="Сводка по доске">
          <SurfaceCard className="p-4">
            <p className="text-caption uppercase text-text-muted">Всего задач</p>
            <p className="mt-1 text-h2 text-text">{cards.length}</p>
          </SurfaceCard>
          <SurfaceCard className="p-4">
            <p className="text-caption uppercase text-text-muted">С дедлайном</p>
            <p className="mt-1 text-h2 text-info">{datedCardsCount}</p>
          </SurfaceCard>
          <SurfaceCard className="p-4">
            <p className="text-caption uppercase text-text-muted">Срочные</p>
            <p className="mt-1 text-h2 text-danger">{urgentCardsCount}</p>
          </SurfaceCard>
        </section>

        {isCreatingColumn ? (
          <SurfaceCard as="section" className="p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <Field label="Название колонки" htmlFor="new-column-name" className="flex-1">
                <TextInput id="new-column-name" value={colName} onChange={(e) => setColName(e.target.value)} placeholder="Введите название" />
              </Field>
              <Field label="Иконка" htmlFor="new-column-icon">
                <Select id="new-column-icon" value={colIcon} onChange={(e) => setColIcon(e.target.value)} aria-label="Выбор иконки колонки">
                  {availableIcons.map((icon) => <option key={icon} value={icon}>{icon}</option>)}
                </Select>
              </Field>
              <div className="flex min-h-11 items-center gap-2">
                <Button onClick={onCreateColumn} aria-label="Добавить колонку">Добавить</Button>
                <Button type="button" variant="secondary" onClick={() => { setIsCreatingColumn(false); setColName('') }} aria-label="Отменить создание колонки">Отмена</Button>
              </div>
            </div>
          </SurfaceCard>
        ) : null}

        <BoardFilters
          activeFilterCount={activeFilterCount}
          searchQuery={searchQuery}
          onSearchQueryChange={setSearchQuery}
          labelOptions={allKnownLabels}
          activeLabel={activeLabel}
          onActiveLabelChange={setActiveLabel}
        />

        <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={handleDragStart} onDragEnd={handleDragEnd} onDragCancel={handleDragCancel}>
          <SortableContext items={sortedColumns.map((column) => `column-${column.id}`)} strategy={rectSortingStrategy}>
            <section className="grid gap-5 lg:grid-cols-3" aria-label="Колонки канбан-доски">
              {sortedColumns.map((col, index) => {
                const quickAddPreview = quickAddPreviewFor(col.id)
                return (
                  <BoardColumn
                    key={col.id}
                    column={col}
                    accentClass={accentForColumn(index)}
                    cards={grouped[col.id] || []}
                    newCardTitle={newCardTitle[col.id] || ''}
                    onNewCardTitleChange={(value) => setNewCardTitle((s) => ({ ...s, [col.id]: value }))}
                    onCreateCard={() => onCreateCard(col.id)}
                    parsedQuickAddDeadline={quickAddPreview?.deadline ? formatDateTime(quickAddPreview.deadline) : undefined}
                    parsedQuickAddTitle={quickAddPreview?.title}
                    onDismissParsedDeadline={() => dismissQuickAddDeadline(col.id)}
                    onCardOpen={openTaskModal}
                    priorityFor={priorityFor}
                    labelsFor={labelsFor}
                    deadlineFor={deadlineFor}
                    assigneeNameFor={assigneeNameFor}
                    formatDateTime={formatDateTime}
                    formatUpdatedStatus={formatUpdatedStatus}
                    move={move}
                    stopCardOpen={stopCardOpen}
                    stopCardKeyBubble={stopCardKeyBubble}
                  />
                )
              })}
            </section>
          </SortableContext>
          <DragOverlay>
            {activeDragCard ? (
              <BoardTaskCard
                card={activeDragCard}
                priorityFor={priorityFor}
                labelsFor={labelsFor}
                deadlineFor={deadlineFor}
                assigneeNameFor={assigneeNameFor}
                formatDateTime={formatDateTime}
                formatUpdatedStatus={formatUpdatedStatus}
                overlay
              />
            ) : null}
          </DragOverlay>
        </DndContext>
      </main>

      {taskModal.selectedCard && taskModal.draft ? (
        <TaskModal
          selectedCard={taskModal.selectedCard}
          boardName={boardName}
          draft={taskModal.draft}
          saveBusy={taskModal.saveBusy}
          deleteBusy={taskModal.deleteBusy}
          modalError={taskModal.modalError}
          onClose={closeTaskModal}
          onSave={() => void saveAndCloseTaskModal()}
          onDelete={() => void deleteAndCloseTaskModal()}
          setDraft={taskModal.setDraft}
          reminderDrafts={taskModal.reminderDrafts}
          reminderData={taskModal.reminderData}
          reminderLoading={taskModal.reminderLoading}
          reminderError={taskModal.reminderError}
          reminderFieldError={taskModal.reminderFieldError}
          newReminderValue={taskModal.newReminderValue}
          setNewReminderValue={taskModal.setNewReminderValue}
          newReminderUnit={taskModal.newReminderUnit}
          setNewReminderUnit={taskModal.setNewReminderUnit}
          applyReminderValue={taskModal.applyReminderValue}
          applyReminderUnit={taskModal.applyReminderUnit}
          applyReminderChannel={taskModal.applyReminderChannel}
          toggleReminder={taskModal.toggleReminder}
          addReminderInterval={taskModal.addReminderInterval}
          removeReminderInterval={taskModal.removeReminderInterval}
          selectedChecklist={taskModal.selectedChecklist}
          newChecklistItem={taskModal.newChecklistItem}
          setNewChecklistItem={taskModal.setNewChecklistItem}
          addChecklistItem={taskModal.addChecklistItem}
          toggleChecklistItem={taskModal.toggleChecklistItem}
          removeChecklistItem={taskModal.removeChecklistItem}
          selectedSubtasks={taskModal.selectedSubtasks}
          newSubtaskTitle={taskModal.newSubtaskTitle}
          setNewSubtaskTitle={taskModal.setNewSubtaskTitle}
          subtaskBusy={taskModal.subtaskBusy}
          addSubtask={taskModal.addSubtask}
          recurrenceRule={taskModal.recurrenceRule}
          recurrenceDraft={taskModal.recurrenceDraft}
          setRecurrenceDraft={taskModal.setRecurrenceDraft}
          recurrencePreset={taskModal.recurrencePreset}
          recurrenceLoading={taskModal.recurrenceLoading}
          recurrenceBusy={taskModal.recurrenceBusy}
          recurrenceError={taskModal.recurrenceError}
          applyRecurrencePreset={taskModal.applyRecurrencePreset}
          comments={taskModal.comments}
          newComment={taskModal.newComment}
          setNewComment={taskModal.setNewComment}
          editingCommentId={taskModal.editingCommentId}
          editingCommentText={taskModal.editingCommentText}
          setEditingCommentText={taskModal.setEditingCommentText}
          commentsLoading={taskModal.commentsLoading}
          commentsBusy={taskModal.commentsBusy}
          commentsError={taskModal.commentsError}
          addComment={taskModal.addComment}
          startEditComment={taskModal.startEditComment}
          cancelEditComment={taskModal.cancelEditComment}
          saveEditedComment={taskModal.saveEditedComment}
          deleteComment={taskModal.deleteComment}
          activities={taskModal.activities}
          activityLoading={taskModal.activityLoading}
          activityError={taskModal.activityError}
          reloadActivity={taskModal.reloadActivity}
          selectedAttachments={taskModal.selectedAttachments}
          newAttachmentType={taskModal.newAttachmentType}
          setNewAttachmentType={taskModal.setNewAttachmentType}
          attachmentFileInputKey={taskModal.attachmentFileInputKey}
          attachmentFileInputRef={taskModal.attachmentFileInputRef}
          setNewAttachmentFiles={taskModal.setNewAttachmentFiles}
          newAttachmentFiles={taskModal.newAttachmentFiles}
          newAttachmentName={taskModal.newAttachmentName}
          setNewAttachmentName={taskModal.setNewAttachmentName}
          newAttachmentUrl={taskModal.newAttachmentUrl}
          setNewAttachmentUrl={taskModal.setNewAttachmentUrl}
          addAttachment={taskModal.addAttachment}
          removeAttachment={taskModal.removeAttachment}
          assignees={assignees}
          selectedCardId={taskModal.selectedCardId}
          profileTimeZone={taskModal.profileTimeZone}
          getTimeZoneLabel={getTimeZoneLabel}
          scheduleDeadlineSave={taskModal.scheduleDeadlineSave}
          selectedPriority={taskModal.selectedPriority}
          allKnownLabels={allKnownLabels}
          selectedLabels={taskModal.selectedLabels}
          newLabel={taskModal.newLabel}
          setNewLabel={taskModal.setNewLabel}
          addLabelValue={taskModal.addLabelValue}
          removeLabel={taskModal.removeLabel}
          addLabel={taskModal.addLabel}
        />
      ) : null}

    </div>
  )
}

function BoardPageSkeleton() {
  return (
    <div className="min-h-screen bg-background pb-12 text-text" aria-busy="true" aria-label="Загрузка доски">
      <header className="sticky top-0 z-sticky border-b border-border/80 bg-background/72 px-4 py-5 backdrop-blur-xl">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-4 w-3" />
              <Skeleton className="h-4 w-32" />
            </div>
            <div className="space-y-3">
              <div className="flex gap-2">
                <Skeleton className="h-6 w-24 rounded-full" />
                <Skeleton className="h-6 w-28 rounded-full" />
              </div>
              <Skeleton className="h-10 w-56 max-w-full" />
              <Skeleton className="h-4 w-96 max-w-full" />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Skeleton className="h-10 w-36 rounded-control" />
            <Skeleton className="h-10 w-20 rounded-control" />
            <Skeleton className="h-10 w-20 rounded-control" />
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl space-y-6 px-4 pt-6">
        <section className="grid gap-3 sm:grid-cols-3" aria-label="Загрузка сводки по доске">
          {Array.from({ length: 3 }).map((_, index) => (
            <SurfaceCard key={index} className="p-4">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="mt-3 h-9 w-16" />
            </SurfaceCard>
          ))}
        </section>

        <SurfaceCard as="section" className="space-y-4 p-5">
          <div className="flex flex-wrap items-center gap-3">
            <Skeleton className="h-11 min-w-64 flex-1 rounded-control" />
            <Skeleton className="h-11 w-44 rounded-control" />
            <Skeleton className="h-11 w-32 rounded-control" />
          </div>
        </SurfaceCard>

        <section className="grid gap-5 lg:grid-cols-3" aria-label="Загрузка колонок канбан-доски">
          {Array.from({ length: 3 }).map((_, columnIndex) => (
            <div key={columnIndex} className="flex h-full flex-col rounded-[1.4rem] border border-border/80 bg-[image:var(--gradient-surface)] p-4 shadow-surface backdrop-blur">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <Skeleton className="h-10 w-10 rounded-2xl" />
                  <Skeleton className="h-7 w-28" />
                </div>
                <Skeleton className="h-6 w-20 rounded-full" />
              </div>

              <div className="mt-5 flex items-center gap-2 rounded-panel border border-border/70 bg-background-subtle/60 p-2">
                <Skeleton className="h-11 flex-1 rounded-control" />
                <Skeleton className="h-11 w-11 rounded-control" />
              </div>

              <div className="mt-4 space-y-4">
                {Array.from({ length: 3 }).map((_, cardIndex) => (
                  <div key={cardIndex} className="rounded-[1.15rem] border border-border/75 bg-surface/90 p-4 shadow-surface">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 space-y-2">
                        <Skeleton className="h-5 w-4/5" />
                        <Skeleton className="h-4 w-full" />
                        <Skeleton className="h-4 w-2/3" />
                      </div>
                      <Skeleton className="h-7 w-20 rounded-full" />
                    </div>
                    <div className="mt-3 flex gap-2">
                      <Skeleton className="h-6 w-16 rounded-full" />
                      <Skeleton className="h-6 w-20 rounded-full" />
                    </div>
                    <div className="mt-3 flex items-center justify-between">
                      <Skeleton className="h-4 w-32" />
                      <Skeleton className="h-8 w-24 rounded-control" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </section>
      </main>
    </div>
  )
}
