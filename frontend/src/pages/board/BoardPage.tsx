import { useEffect, useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { api } from '../../api/client'
import { queryKeys } from '../../api/queries/keys'
import { useBoards } from '../../api/queries/boards'
import { useColumns, useCreateColumn } from '../../api/queries/columns'
import { useCards, useCreateCard, useMoveCard } from '../../api/queries/cards'
import { AUTH_TOKEN_KEY } from '../../app/auth'
import { toggleTheme } from '../../app/theme'
import { getTimeZoneLabel } from '../../shared/lib/timezone'
import { Button, Card as SurfaceCard, Field, Select, TextInput, Toast } from '../../shared/ui'
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
import { BoardColumn } from './ui/BoardColumn'
import { BoardFilters } from './ui/BoardFilters'
import { BoardHeader } from './ui/BoardHeader'
import { TaskModal } from './ui/TaskModal'

interface BoardPageProps {
  onLogout: () => void
  user: AuthUser
}

export function BoardPage({ onLogout, user }: BoardPageProps) {
  const boardId = Number(window.location.pathname.split('/').at(-1))
  const queryClient = useQueryClient()

  const { data: cards = [] } = useCards(boardId)
  const { data: columns = [] } = useColumns(boardId)
  const { data: boards = [] } = useBoards()
  const boardName = useMemo(
    () => boards.find((b) => b.id === boardId)?.name ?? '',
    [boards, boardId],
  )

  const createCardMutation = useCreateCard(boardId)
  const createColumnMutation = useCreateColumn(boardId)
  const moveCardMutation = useMoveCard(boardId)

  const [colName, setColName] = useState('')
  const [colIcon, setColIcon] = useState('📋')
  const [isCreatingColumn, setIsCreatingColumn] = useState(false)
  const [newCardTitle, setNewCardTitle] = useState<Record<number, string>>({})
  const [dragged, setDragged] = useState<Card | null>(null)
  const [activeLabel, setActiveLabel] = useState('Все')
  const [searchQuery, setSearchQuery] = useState('')
  const [assignees, setAssignees] = useState<AssigneeOption[]>([])

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
      g[Number(k)]?.sort((a, b) => {
        const createdDiff = Date.parse(b.created_at) - Date.parse(a.created_at)
        return createdDiff || b.id - a.id
      })
    }
    return g
  }, [filteredCards])

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
    const title = (newCardTitle[columnId] || '').trim()
    if (!title) return

    const tempId = -Date.now()
    const placeholder: Card = {
      id: tempId,
      board: boardId,
      column: columnId,
      assignee: null,
      title,
      description: '',
      deadline: null,
      priority: PRIORITY_NORMAL,
      labels: [],
      checklist: [],
      attachments: [],
      position: '999999',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      version: 1,
    }
    queryClient.setQueryData<Card[]>(queryKeys.cards(boardId), (prev) =>
      prev ? [...prev, placeholder] : [placeholder],
    )
    taskModal.setSelectedCard(placeholder)
    setNewCardTitle((s) => ({ ...s, [columnId]: '' }))

    try {
      const card = await createCardMutation.mutateAsync({ column: columnId, title })
      // Replace the placeholder with the persisted card.
      queryClient.setQueryData<Card[]>(queryKeys.cards(boardId), (prev) => {
        if (!prev) return [card]
        const withoutTemp = prev.filter((c) => c.id !== tempId)
        if (withoutTemp.some((c) => c.id === card.id)) return withoutTemp
        return [...withoutTemp, card]
      })
      taskModal.setSelectedCard((prev) => (prev?.id === tempId ? card : prev))
    } catch {
      queryClient.setQueryData<Card[]>(queryKeys.cards(boardId), (prev) =>
        prev?.filter((c) => c.id !== tempId),
      )
    }
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

  const handleDropOnColumn = async (columnId: number) => {
    if (!dragged || dragged.column === columnId) return
    const cardId = dragged.id
    const fromColumn = dragged.column
    try {
      await moveCardMutation.mutateAsync({
        id: cardId,
        payload: { to_column: columnId },
        optimistic: (cs) => cs.map((c) => (c.id === cardId ? { ...c, column: columnId } : c)),
      })
    } catch {
      // rollback handled by onError; nothing else to do.
      void fromColumn
    }
  }

  const stopCardOpen = (event: { preventDefault: () => void; stopPropagation: () => void }) => {
    event.preventDefault()
    event.stopPropagation()
  }

  const stopCardKeyBubble = (event: { stopPropagation: () => void }) => {
    event.stopPropagation()
  }

  const sortedColumns = [...columns].sort((a, b) => (a.position > b.position ? 1 : -1))
  const availableIcons = ['📋', '📝', '⚡', '✅', '🧩', '🛠️', '🎯', '📦', '💡', '🔍']
  const accentClasses = ['text-primary', 'text-warning', 'text-success', 'text-danger', 'text-secondary', 'text-accent']
  const accentForColumn = (index: number) => accentClasses[index % accentClasses.length] ?? 'text-primary'

  return (
    <div className="min-h-screen bg-background pb-12 text-text">
      <BoardHeader boardName={boardName} onCreateColumn={() => setIsCreatingColumn(true)} onLogout={onLogout} onToggleTheme={toggleTheme} />

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

        <section className="grid gap-5 lg:grid-cols-3" aria-label="Колонки канбан-доски">
          {sortedColumns.map((col, index) => (
            <BoardColumn
              key={col.id}
              column={col}
              accentClass={accentForColumn(index)}
              cards={grouped[col.id] || []}
              newCardTitle={newCardTitle[col.id] || ''}
              onNewCardTitleChange={(value) => setNewCardTitle((s) => ({ ...s, [col.id]: value }))}
              onCreateCard={() => onCreateCard(col.id)}
              onDrop={() => handleDropOnColumn(col.id)}
              onCardOpen={taskModal.setSelectedCard}
              onDragStart={setDragged}
              onDragEnd={() => setDragged(null)}
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
          ))}
        </section>
      </main>

      {taskModal.selectedCard && taskModal.draft ? (
        <TaskModal
          selectedCard={taskModal.selectedCard}
          boardName={boardName}
          draft={taskModal.draft}
          saveBusy={taskModal.saveBusy}
          deleteBusy={taskModal.deleteBusy}
          modalError={taskModal.modalError}
          onClose={() => taskModal.setSelectedCard(null)}
          onSave={() => void taskModal.onSaveCard()}
          onDelete={() => void taskModal.deleteSelectedCard()}
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

      {taskModal.toast ? (
        <Toast
          tone={taskModal.toast.tone === 'error' ? 'error' : 'info'}
          onClose={() => taskModal.setToast(null)}
          action={taskModal.toast.retry ? { label: 'Повторить', loading: taskModal.toastSending, onClick: () => void taskModal.retryToast() } : undefined}
        >
          {taskModal.toast.message}
        </Toast>
      ) : null}
    </div>
  )
}
