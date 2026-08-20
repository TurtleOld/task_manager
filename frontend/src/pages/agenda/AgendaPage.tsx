import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { useBoards } from '../../api/queries/boards'
import {
  makeAgendaPlaceholderCard,
  useAgenda,
  useAgendaComplete,
  useAgendaCreateCard,
  useAgendaUpdateDeadline,
  useCompletedAgenda,
  useFamilyShoppingItemToggle,
  useFamilyToday,
} from '../../api/queries/agenda'
import { useAssignableUsers } from '../../api/queries/task'
import type { AgendaCard, AuthUser } from '../../api/types'
import { AUTH_TOKEN_KEY } from '../../app/auth'
import { useMediaQuery } from '../../shared/hooks/useMediaQuery'
import { useVisualViewportInset } from '../../shared/hooks/useVisualViewportInset'
import { EmptyState, ErrorState, PageShell, Skeleton } from '@/components/ui'
import { AGENDA_GROUP_LABELS, AGENDA_VIEW_GROUPS, bucketAgendaCards } from './lib/grouping'
import type { AgendaGroupId, AgendaViewMode } from './lib/grouping'
import { groupCompletedByDay } from './lib/completedGrouping'
import { useAgendaRealtime } from './hooks/useAgendaRealtime'
import { useFamilyTodayRealtime } from './hooks/useFamilyTodayRealtime'
import { AgendaGroup } from './ui/AgendaGroup'
import { CompletedGroup } from './ui/CompletedGroup'
import { AgendaHeader } from './ui/AgendaHeader'
import type { AgendaPeopleOption } from './ui/AgendaHeader'
import { QuickAddBar } from './ui/QuickAddBar'
import type { QuickAddResult } from './ui/QuickAddBar'
import { FamilyTodayPanel } from './ui/FamilyTodayPanel'
import { TaskScreen } from '../task/TaskScreen'

const COLLAPSED_STORAGE_KEY = 'agenda.collapsed'
const VIEW_MODE_STORAGE_KEY = 'agenda.viewMode'
/** Группы, свёрнутые по умолчанию, пока пользователь сам их не раскрыл. */
const DEFAULT_COLLAPSED_GROUPS = new Set<AgendaGroupId>(['tomorrow', 'this-week', 'later', 'someday'])
/** Совпадает с брейкпоинтом `xl:`, на котором появляется правая панель. */
const DESKTOP_PANEL_QUERY = '(min-width: 1280px)'
/** Совпадает с брейкпоинтом `lg:`, на котором прячется нижняя таб-панель/строка добавления. */
const MOBILE_LAYOUT_QUERY = '(max-width: 1023px)'

interface AgendaPageProps {
  user: AuthUser
}

export function AgendaPage({ user }: AgendaPageProps) {
  const params = useParams()
  const navigate = useNavigate()
  const listId = parseListId(params.listId)
  const taskId = parseListId(params.taskId)
  const scopeKey = listId == null ? 'all' : `list-${listId}`
  const closeTaskPath = listId != null ? `/lists/${listId}` : '/'

  const { data, isLoading, isError, refetch } = useAgenda(listId)
  const { data: boards = [] } = useBoards()
  const completeMutation = useAgendaComplete(listId, user.id)
  const deadlineMutation = useAgendaUpdateDeadline(listId)
  const isDesktopPanel = useMediaQuery(DESKTOP_PANEL_QUERY)
  const isMobileLayout = useMediaQuery(MOBILE_LAYOUT_QUERY)
  const keyboardInset = useVisualViewportInset()
  const familyToday = useFamilyToday({ enabled: isDesktopPanel })
  const shoppingToggleMutation = useFamilyShoppingItemToggle()
  const assignableUsersQuery = useAssignableUsers(user)
  const createCardMutation = useAgendaCreateCard(listId)

  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(() => {
    try {
      const raw = localStorage.getItem(COLLAPSED_STORAGE_KEY)
      return raw ? (JSON.parse(raw) as Record<string, boolean>) : {}
    } catch {
      return {}
    }
  })
  const [activeAssigneeId, setActiveAssigneeId] = useState<number | null>(null)
  const [announcement, setAnnouncement] = useState('')
  const [viewMode, setViewMode] = useState<AgendaViewMode>(() => {
    try {
      const raw = localStorage.getItem(VIEW_MODE_STORAGE_KEY)
      return raw === 'today' || raw === 'week' || raw === 'all' || raw === 'completed' ? raw : 'all'
    } catch {
      return 'all'
    }
  })
  const {
    data: completedData,
    isLoading: completedLoading,
    isError: completedIsError,
    refetch: refetchCompleted,
  } = useCompletedAgenda(listId, { enabled: viewMode === 'completed' })

  useEffect(() => {
    try {
      localStorage.setItem(COLLAPSED_STORAGE_KEY, JSON.stringify(collapsed))
    } catch {
      // localStorage may be unavailable in private mode.
    }
  }, [collapsed])

  useEffect(() => {
    try {
      localStorage.setItem(VIEW_MODE_STORAGE_KEY, viewMode)
    } catch {
      // localStorage may be unavailable in private mode.
    }
  }, [viewMode])

  useEffect(() => {
    if (params.listId != null && listId == null) {
      navigate('/', { replace: true })
    }
  }, [listId, navigate, params.listId])

  const wsToken = localStorage.getItem(AUTH_TOKEN_KEY)
  const realtimeBoardIds = useMemo(() => {
    if (listId != null) return [listId]
    return boards.map((board) => board.id)
  }, [boards, listId])
  useAgendaRealtime({ boardIds: realtimeBoardIds, listId, token: wsToken })
  const familyBoardIds = useMemo(() => (isDesktopPanel ? boards.map((board) => board.id) : []), [boards, isDesktopPanel])
  useFamilyTodayRealtime({ boardIds: familyBoardIds, token: wsToken })

  const cards = useMemo(() => data?.cards ?? [], [data?.cards])
  const boundaries = data?.boundaries

  const boardsById = useMemo(() => new Map(boards.map((board) => [board.id, board])), [boards])

  const visibleGroups = AGENDA_VIEW_GROUPS[viewMode]

  const todayLabel = useMemo(() => {
    if (!boundaries) return AGENDA_GROUP_LABELS.today
    const date = new Date(boundaries.today_start)
    const weekday = date.toLocaleDateString('ru-RU', { weekday: 'long' })
    const dayMonth = date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })
    return `Сегодня, ${weekday} ${dayMonth}`
  }, [boundaries])

  const groupLabels = useMemo(() => ({ ...AGENDA_GROUP_LABELS, today: todayLabel }), [todayLabel])

  const people = useMemo<AgendaPeopleOption[]>(() => {
    const map = new Map<number, AgendaPeopleOption>()
    for (const card of cards) {
      const assignee = card.assignee
      if (!assignee || map.has(assignee.id)) continue
      const name = assignee.full_name || assignee.username || 'Исполнитель'
      map.set(assignee.id, {
        id: assignee.id,
        name,
        initial: name[0]?.toUpperCase() ?? '?',
      })
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name))
  }, [cards])

  const visibleCards = useMemo(() => {
    if (activeAssigneeId == null) return cards
    return cards.filter((card) => card.assignee?.id === activeAssigneeId)
  }, [activeAssigneeId, cards])

  const buckets = boundaries ? bucketAgendaCards(visibleCards, boundaries) : null

  const completedCards = useMemo(() => completedData?.cards ?? [], [completedData?.cards])
  const visibleCompletedCards = useMemo(() => {
    if (activeAssigneeId == null) return completedCards
    return completedCards.filter((card) => card.assignee?.id === activeAssigneeId)
  }, [activeAssigneeId, completedCards])
  const completedGroups = completedData
    ? groupCompletedByDay(visibleCompletedCards, completedData.boundaries)
    : []

  const completeBusy = completeMutation.isPending
  const deadlineBusy = deadlineMutation.isPending

  const isGroupCollapsed = (group: AgendaGroupId) => {
    const key = `${scopeKey}:${group}`
    const stored = collapsed[key]
    return stored ?? DEFAULT_COLLAPSED_GROUPS.has(group)
  }

  const toggleCollapsed = (group: AgendaGroupId) => {
    const key = `${scopeKey}:${group}`
    setCollapsed((prev) => ({ ...prev, [key]: !isGroupCollapsed(group) }))
  }

  const handleCompleteToggle = (card: AgendaCard, complete: boolean) => {
    setAnnouncement(
      complete ? `Задача «${card.title}» выполнена` : `Отметка с задачи «${card.title}» снята`,
    )
    completeMutation.mutate(
      { id: card.id, complete },
      {
        onError: () => {
          toast.error(complete ? 'Не удалось отметить задачу выполненной' : 'Не удалось снять отметку')
        },
      },
    )
  }

  const handleDeadlineCommit = (card: AgendaCard, deadline: string | null) => {
    deadlineMutation.mutate(
      { id: card.id, deadline },
      {
        onError: () => toast.error('Не удалось изменить срок'),
      },
    )
  }

  const handleSwipeComplete = (card: AgendaCard) => {
    completeMutation.mutate(
      { id: card.id, complete: true },
      {
        onSuccess: () => {
          toast.success(`Задача «${card.title}» выполнена`, {
            action: {
              label: 'Отменить',
              onClick: () => completeMutation.mutate({ id: card.id, complete: false }),
            },
          })
        },
        onError: () => toast.error('Не удалось отметить задачу выполненной'),
      },
    )
  }

  const handleSwipeTomorrow = (card: AgendaCard) => {
    if (!boundaries) return
    const previousDeadline = card.deadline
    deadlineMutation.mutate(
      { id: card.id, deadline: boundaries.tomorrow_start },
      {
        onSuccess: () => {
          toast.success(`Срок задачи «${card.title}» перенесён на завтра`, {
            action: {
              label: 'Отменить',
              onClick: () => deadlineMutation.mutate({ id: card.id, deadline: previousDeadline }),
            },
          })
        },
        onError: () => toast.error('Не удалось изменить срок'),
      },
    )
  }

  const handleQuickAddCreate = (result: QuickAddResult) => {
    const targetListId = listId ?? result.listId
    if (targetListId == null) return
    const placeholder = makeAgendaPlaceholderCard({
      id: -Date.now(),
      title: result.title,
      list: targetListId,
      deadline: result.deadline,
      assignee: result.assigneeId != null ? { id: result.assigneeId, name: result.assigneeName } : null,
    })
    createCardMutation.mutate(
      {
        payload: {
          board: targetListId,
          title: result.title,
          deadline: result.deadline,
          assignee: result.assigneeId,
          labels: result.tag ? [{ name: result.tag }] : [],
        },
        placeholder,
      },
      {
        onSuccess: (card) => toast.success(`Задача «${card.title}» добавлена`),
        onError: () => toast.error('Не удалось добавить задачу'),
      },
    )
  }

  const handlePersonClick = (userId: number) => {
    setActiveAssigneeId((prev) => (prev === userId ? null : userId))
  }

  const handleShoppingItemToggle = (itemId: number, done: boolean) => {
    const cardId = familyToday.data?.shopping_list?.card.id
    if (cardId == null) return
    shoppingToggleMutation.mutate(
      { cardId, itemId, done },
      { onError: () => toast.error('Не удалось отметить пункт') },
    )
  }

  const taskOverlay =
    taskId != null && listId != null ? (
      <TaskScreen taskId={taskId} listId={listId} user={user} boundaries={boundaries} onClose={() => navigate(closeTaskPath)} />
    ) : null

  if (isLoading) {
    return (
      <>
        <AgendaPageSkeleton />
        {taskOverlay}
      </>
    )
  }

  if (isError) {
    return (
      <PageShell width="2xl" spacing="md">
        <ErrorState action={{ label: 'Повторить', onClick: () => void refetch() }}>
          Не удалось загрузить агенду.
        </ErrorState>
        {taskOverlay}
      </PageShell>
    )
  }

  const emptyAgenda = cards.length === 0
  const emptyByFilter = !emptyAgenda && visibleCards.length === 0
  const emptyByView =
    !emptyAgenda && !emptyByFilter && buckets != null && visibleGroups.every((group) => buckets[group].length === 0)

  const mobileQuickAddEnabled = isMobileLayout
  const quickAddBoards = listId == null ? boards.map((board) => ({ id: board.id, name: board.name })) : undefined

  return (
    <div className="min-h-screen bg-background/80 pb-12 text-text" style={mobileQuickAddEnabled ? { paddingBottom: 'calc(9rem + env(safe-area-inset-bottom))' } : undefined}>
      <AgendaHeader
        activeAssigneeId={activeAssigneeId}
        activeListId={listId}
        lists={boards.map((board) => ({ id: board.id, name: board.name, icon: board.icon }))}
        people={people}
        onAssigneeFilterChange={setActiveAssigneeId}
        onViewModeChange={setViewMode}
        viewMode={viewMode}
        quickAdd={
          !isMobileLayout
            ? {
                busy: createCardMutation.isPending,
                onSubmit: handleQuickAddCreate,
                people: assignableUsersQuery.data ?? [],
                timeZone: boundaries?.timezone,
                boards: quickAddBoards,
              }
            : null
        }
      />

      <div className="mx-auto flex w-full max-w-6xl items-start gap-6 px-4 pt-6 sm:px-6 xl:px-8">
        <main className="mx-auto w-full min-w-0 max-w-3xl xl:mx-0 xl:max-w-none xl:flex-1">
          <div aria-live="polite" role="status" className="sr-only">
            {announcement}
          </div>

          {viewMode === 'completed' ? (
            completedLoading ? (
              <div className="space-y-5">
                {Array.from({ length: 2 }).map((_, index) => (
                  <div key={index} className="space-y-1">
                    <Skeleton className="h-10 w-40 rounded-control" />
                    <Skeleton className="h-12 w-full rounded-control" />
                    <Skeleton className="h-12 w-full rounded-control" />
                  </div>
                ))}
              </div>
            ) : completedIsError ? (
              <ErrorState action={{ label: 'Повторить', onClick: () => void refetchCompleted() }}>
                Не удалось загрузить выполненные задачи.
              </ErrorState>
            ) : completedCards.length === 0 ? (
              <EmptyState title="Выполненных задач пока нет">
                Здесь появятся задачи по мере их выполнения.
              </EmptyState>
            ) : visibleCompletedCards.length === 0 ? (
              <EmptyState title="По фильтру ничего нет">
                У выбранного исполнителя нет выполненных задач.
              </EmptyState>
            ) : (
              <div className="space-y-5">
                {completedGroups.map((group) => (
                  <CompletedGroup
                    key={group.key}
                    boardsById={boardsById}
                    boundaries={completedData!.boundaries}
                    busy={completeBusy}
                    deadlineBusy={deadlineBusy}
                    group={group}
                    onCompleteToggle={handleCompleteToggle}
                    onDeadlineCommit={handleDeadlineCommit}
                  />
                ))}
              </div>
            )
          ) : emptyAgenda ? (
            <div className="flex min-h-[calc(100vh-15rem)] items-center justify-center">
              <EmptyState title="На сегодня всё спокойно" className="w-full max-w-md">
                Задач ни в одной группе нет. Новые задачи появятся здесь по мере добавления.
              </EmptyState>
            </div>
          ) : emptyByFilter ? (
            <EmptyState title="По фильтру ничего нет">
              У выбранного исполнителя нет задач в агенде.
            </EmptyState>
          ) : emptyByView ? (
            <EmptyState title="В этом виде ничего нет">
              Переключитесь на «Все дела», чтобы увидеть остальные задачи.
            </EmptyState>
          ) : buckets ? (
            <div className="space-y-5">
              {visibleGroups.map((group) => (
                <AgendaGroup
                  key={group}
                  boardsById={boardsById}
                  boundaries={boundaries!}
                  busy={completeBusy}
                  cards={buckets[group]}
                  collapsed={isGroupCollapsed(group)}
                  group={group}
                  label={groupLabels[group]}
                  onCompleteToggle={handleCompleteToggle}
                  onDeadlineCommit={handleDeadlineCommit}
                  onSwipeComplete={handleSwipeComplete}
                  onSwipeTomorrow={handleSwipeTomorrow}
                  onToggle={() => toggleCollapsed(group)}
                  deadlineBusy={deadlineBusy}
                />
              ))}
            </div>
          ) : null}
        </main>

        {isDesktopPanel ? (
          <aside className="hidden w-80 shrink-0 xl:block">
            <FamilyTodayPanel
              data={familyToday.data}
              isLoading={familyToday.isLoading}
              isError={familyToday.isError}
              activeAssigneeId={activeAssigneeId}
              onPersonClick={handlePersonClick}
              onShoppingItemToggle={handleShoppingItemToggle}
              shoppingBusy={shoppingToggleMutation.isPending}
            />
          </aside>
        ) : null}
      </div>

      {mobileQuickAddEnabled ? (
        <div
          className="fixed inset-x-0 z-sticky border-t border-border/80 bg-background/95 px-3 py-2 backdrop-blur-xl lg:hidden"
          style={{ bottom: keyboardInset > 0 ? keyboardInset : 'calc(4rem + env(safe-area-inset-bottom))' }}
        >
          <QuickAddBar
            busy={createCardMutation.isPending}
            onSubmit={handleQuickAddCreate}
            people={assignableUsersQuery.data ?? []}
            timeZone={boundaries?.timezone}
            boards={quickAddBoards}
          />
        </div>
      ) : null}

      {taskOverlay}
    </div>
  )
}

function parseListId(value: string | undefined): number | null {
  if (value == null) return null
  const id = Number(value)
  return Number.isInteger(id) && id > 0 ? id : null
}

function AgendaPageSkeleton() {
  return (
    <div className="min-h-screen bg-background/80 pb-12 text-text" aria-busy="true" aria-label="Загрузка агенды">
      <header
        className="sticky z-sticky flex h-14 items-center gap-3 border-b border-border/80 bg-background/78 px-4 backdrop-blur-xl sm:px-6"
        style={{ top: 'var(--app-header-height)' }}
      >
        <Skeleton className="h-8 w-28 rounded-full" />
        <Skeleton className="h-8 w-20 rounded-full" />
        <Skeleton className="h-8 w-24 rounded-full" />
      </header>
      <main className="mx-auto w-full max-w-3xl space-y-5 px-4 pt-6 sm:px-6">
        {Array.from({ length: 4 }).map((_, index) => (
          <section key={index} className="space-y-1">
            <div className="flex h-10 items-center gap-2 px-3">
              <Skeleton className="h-4 w-4 rounded" />
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-5 w-8 rounded-full" />
            </div>
            {Array.from({ length: 2 }).map((__, rowIndex) => (
              <div key={rowIndex} className="flex h-12 items-center gap-3 px-3">
                <Skeleton className="h-5 w-5 rounded-full" />
                <Skeleton className="h-4 flex-1" />
                <Skeleton className="h-6 w-24 rounded-full" />
                <Skeleton className="h-6 w-6 rounded-full" />
              </div>
            ))}
          </section>
        ))}
      </main>
    </div>
  )
}
