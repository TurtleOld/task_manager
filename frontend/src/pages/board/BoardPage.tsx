import { useEffect, useMemo, useState } from 'react'
import { api } from '../../api/client'
import { AUTH_TOKEN_KEY } from '../../app/auth'
import { toggleTheme } from '../../app/theme'
import { getTimeZoneLabel } from '../../shared/lib/timezone'
import { Button, Card as SurfaceCard, Field, Select, TextInput, Toast } from '../../shared/ui'
import { useBoardWebSocket } from '../../useBoardWebSocket'
import type { BoardEvent } from '../../useBoardWebSocket'
import type { AuthUser, Card, Column } from '../../api/types'
import type { AssigneeOption } from './types'
import { useBoardTaskModal } from './hooks/useBoardTaskModal'
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
  const [columns, setColumns] = useState<Column[]>([])
  const [cards, setCards] = useState<Card[]>([])
  const [boardName, setBoardName] = useState('')
  const [colName, setColName] = useState('')
  const [colIcon, setColIcon] = useState('📋')
  const [isCreatingColumn, setIsCreatingColumn] = useState(false)
  const [newCardTitle, setNewCardTitle] = useState<Record<number, string>>({})
  const [dragged, setDragged] = useState<Card | null>(null)
  const [activeTag, setActiveTag] = useState('Все')
  const [activeCategory, setActiveCategory] = useState('Все')
  const [searchQuery, setSearchQuery] = useState('')
  const [assignees, setAssignees] = useState<AssigneeOption[]>([])
  const [cardTags, setCardTags] = useState<Record<number, string[]>>({})
  const [cardCategories, setCardCategories] = useState<Record<number, string[]>>({})
  const [cardChecklist, setCardChecklist] = useState<Record<number, { id: string; text: string; done: boolean }[]>>({})
  const [cardAttachments, setCardAttachments] = useState<Record<number, Card['attachments']>>({})
  const [cardAssignees, setCardAssignees] = useState<Record<number, number | undefined>>({})
  const [cardDeadlines, setCardDeadlines] = useState<Record<number, string>>({})
  const [cardPriorities, setCardPriorities] = useState<Record<number, '🔥' | '🟡' | '🟢'>>({})

  useEffect(() => {
    api.listColumns(boardId).then(setColumns)
    api.listCardsByBoard(boardId).then((loaded) => {
      setCards(loaded)
      setCardTags(() => {
        const next: Record<number, string[]> = {}
        for (const card of loaded) next[card.id] = card.tags ?? []
        return next
      })
      setCardCategories(() => {
        const next: Record<number, string[]> = {}
        for (const card of loaded) next[card.id] = card.categories ?? []
        return next
      })
      setCardChecklist(() => {
        const next: Record<number, { id: string; text: string; done: boolean }[]> = {}
        for (const card of loaded) next[card.id] = card.checklist ?? []
        return next
      })
      setCardAttachments(() => {
        const next: Record<number, Card['attachments']> = {}
        for (const card of loaded) next[card.id] = card.attachments ?? []
        return next
      })
      setCardAssignees(() => {
        const next: Record<number, number | undefined> = {}
        for (const card of loaded) {
          if (card.assignee != null) next[card.id] = card.assignee
        }
        return next
      })
      setCardPriorities(() => {
        const next: Record<number, '🔥' | '🟡' | '🟢'> = {}
        for (const card of loaded) {
          const marker = (card.priority as '🔥' | '🟡' | '🟢' | undefined) ?? '🟡'
          next[card.id] = marker
        }
        return next
      })
      setCardDeadlines(() => {
        const next: Record<number, string> = {}
        for (const card of loaded) {
          if (card.deadline) next[card.id] = card.deadline
        }
        return next
      })
    })
    api.listBoards().then((boards) => {
      const current = boards.find((b) => b.id === boardId)
      setBoardName(current?.name ?? '')
    })
  }, [boardId])

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
        setCards((prev) => {
          if (prev.some((c) => c.id === event.card.id)) return prev
          return [...prev, event.card]
        })
      } else if (event.type === 'card.updated' || event.type === 'card.moved') {
        setCards((prev) => prev.map((c) => (c.id === event.card.id ? event.card : c)))
      } else if (event.type === 'card.deleted') {
        setCards((prev) => prev.filter((c) => c.id !== event.card_id))
      } else if (event.type === 'column.created') {
        setColumns((prev) => {
          if (prev.some((col) => col.id === event.column.id)) return prev
          return [...prev, event.column]
        })
      } else if (event.type === 'column.updated') {
        setColumns((prev) => prev.map((col) => (col.id === event.column.id ? event.column : col)))
      } else if (event.type === 'column.deleted') {
        setColumns((prev) => prev.filter((col) => col.id !== event.column_id))
      } else if (event.type === 'board.updated') {
        setBoardName(event.board.name)
      }
    },
  })

  const tagOptions = useMemo(() => ['Все', ...new Set(Object.values(cardTags).flat())], [cardTags])
  const categoryOptions = useMemo(() => ['Все', ...new Set(Object.values(cardCategories).flat())], [cardCategories])
  const allKnownTags = tagOptions.filter((t) => t !== 'Все')
  const allKnownCategories = categoryOptions.filter((c) => c !== 'Все')

  const taskModal = useBoardTaskModal({
    cards,
    setCards,
    assignees,
    allKnownTags,
    allKnownCategories,
    cardTags,
    setCardTags,
    cardCategories,
    setCardCategories,
    cardChecklist,
    setCardChecklist,
    cardAttachments,
    setCardAttachments,
    cardAssignees,
    setCardAssignees,
    cardDeadlines,
    setCardDeadlines,
    cardPriorities,
    setCardPriorities,
  })

  const tagsFor = (card: Card) => cardTags[card.id] ?? []
  const categoriesFor = (card: Card) => cardCategories[card.id] ?? []
  const deadlineFor = (card: Card) => cardDeadlines[card.id] ?? card.deadline ?? ''
  const priorityMarkerFor = (card: Card) => cardPriorities[card.id] ?? '🟡'
  const assigneeNameFor = (card: Card) => {
    const assigneeId = cardAssignees[card.id] ?? card.assignee
    return assigneeId != null ? (assignees.find((u) => u.id === assigneeId)?.name ?? null) : null
  }

  const filteredCards = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    return cards.filter((card) => {
      const tags = cardTags[card.id] ?? []
      const categories = cardCategories[card.id] ?? []
      const matchesTag = activeTag === 'Все' || tags.includes(activeTag)
      const matchesCategory = activeCategory === 'Все' || categories.includes(activeCategory)
      const searchable = [card.title, card.description, ...tags, ...categories].join(' ').toLowerCase()
      const matchesSearch = !query || searchable.includes(query)
      return matchesTag && matchesCategory && matchesSearch
    })
  }, [activeCategory, activeTag, cardCategories, cardTags, cards, searchQuery])

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

  const priorityFor = (card: Card) => {
    const marker = priorityMarkerFor(card)
    if (marker === '🔥') return { label: 'Срочно', marker: '🔥', tone: 'danger' as const }
    if (marker === '🟢') return { label: 'Можно когда будет время', marker: '🟢', tone: 'success' as const }
    return { label: 'Важно (до конца недели)', marker: '🟡', tone: 'warning' as const }
  }

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

  const urgentCardsCount = cards.filter((card) => priorityMarkerFor(card) === '🔥').length
  const datedCardsCount = cards.filter((card) => Boolean(deadlineFor(card))).length
  const activeFilterCount = [activeTag !== 'Все', activeCategory !== 'Все', Boolean(searchQuery.trim())].filter(Boolean).length

  const onCreateColumn = async () => {
    if (!colName.trim()) return
    const c = await api.createColumn(boardId, colName.trim(), colIcon)
    setColumns((prev) => [...prev, c])
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
      priority: '🟡',
      tags: [],
      categories: [],
      checklist: [],
      attachments: [],
      position: '999999',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      version: 1,
    }
    setCards((prev) => [...prev, placeholder])
    taskModal.setSelectedCard(placeholder)
    setNewCardTitle((s) => ({ ...s, [columnId]: '' }))

    try {
      const card = await api.createCard(columnId, title)
      setCards((prev) => {
        const withoutTemp = prev.filter((c) => c.id !== tempId)
        if (withoutTemp.some((c) => c.id === card.id)) return withoutTemp
        return [...withoutTemp, card]
      })
      taskModal.setSelectedCard((prev) => (prev?.id === tempId ? card : prev))
    } catch {
      setCards((prev) => prev.filter((c) => c.id !== tempId))
    }
  }

  const move = async (card: Card, dir: 'up' | 'down' | 'left' | 'right') => {
    const originalCard = card
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
      if (swapCard) {
        setCards((prev) =>
          prev.map((c) => {
            if (c.id === card.id) return { ...c, position: swapCard.position }
            if (c.id === swapCard.id) return { ...c, position: card.position }
            return c
          })
        )
      }

      try {
        const updated = await api.moveCard(card.id, { before_id, after_id })
        setCards((prev) => prev.map((c) => (c.id === updated.id ? updated : c)))
      } catch {
        setCards((prev) => prev.map((c) => (c.id === originalCard.id ? originalCard : c)))
      }
    } else {
      const order = [...columns].sort((a, b) => (a.position > b.position ? 1 : -1))
      const curIdx = order.findIndex((c) => c.id === card.column)
      const target = dir === 'left' ? order[curIdx - 1] : order[curIdx + 1]
      if (!target) return

      setCards((prev) => prev.map((c) => (c.id === card.id ? { ...c, column: target.id } : c)))

      try {
        const updated = await api.moveCard(card.id, { to_column: target.id })
        setCards((prev) => prev.map((c) => (c.id === updated.id ? updated : c)))
      } catch {
        setCards((prev) => prev.map((c) => (c.id === originalCard.id ? originalCard : c)))
      }
    }
  }

  const handleDropOnColumn = async (columnId: number) => {
    if (!dragged || dragged.column === columnId) return
    const cardId = dragged.id
    setCards((prev) => prev.map((c) => (c.id === cardId ? { ...c, column: columnId } : c)))
    try {
      const updated = await api.moveCard(cardId, { to_column: columnId })
      setCards((prev) => prev.map((c) => (c.id === updated.id ? updated : c)))
    } catch {
      setCards((prev) => prev.map((c) => (c.id === cardId ? { ...c, column: dragged.column } : c)))
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
          tagOptions={tagOptions}
          activeTag={activeTag}
          onActiveTagChange={setActiveTag}
          categoryOptions={categoryOptions}
          activeCategory={activeCategory}
          onActiveCategoryChange={setActiveCategory}
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
              tagsFor={tagsFor}
              categoriesFor={categoriesFor}
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
          allKnownTags={allKnownTags}
          selectedTags={taskModal.selectedTags}
          newTag={taskModal.newTag}
          setNewTag={taskModal.setNewTag}
          addTagValue={taskModal.addTagValue}
          removeTag={taskModal.removeTag}
          addTag={taskModal.addTag}
          allKnownCategories={allKnownCategories}
          selectedCategories={taskModal.selectedCategories}
          newCategory={taskModal.newCategory}
          setNewCategory={taskModal.setNewCategory}
          addCategoryValue={taskModal.addCategoryValue}
          removeCategory={taskModal.removeCategory}
          addCategory={taskModal.addCategory}
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
