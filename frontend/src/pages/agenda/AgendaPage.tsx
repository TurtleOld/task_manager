import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { useBoards } from '../../api/queries/boards'
import { useAgenda, useAgendaComplete, useAgendaUpdateDeadline } from '../../api/queries/agenda'
import type { AgendaCard, AuthUser } from '../../api/types'
import { AUTH_TOKEN_KEY } from '../../app/auth'
import { EmptyState, ErrorState, PageShell, Skeleton } from '@/components/ui'
import { AGENDA_GROUP_LABELS, AGENDA_GROUP_ORDER, bucketAgendaCards } from './lib/grouping'
import type { AgendaGroupId } from './lib/grouping'
import { useAgendaRealtime } from './hooks/useAgendaRealtime'
import { AgendaGroup } from './ui/AgendaGroup'
import { AgendaHeader } from './ui/AgendaHeader'
import type { AgendaPeopleOption } from './ui/AgendaHeader'

const COLLAPSED_STORAGE_KEY = 'agenda.collapsed'

interface AgendaPageProps {
  user: AuthUser
}

export function AgendaPage({ user }: AgendaPageProps) {
  const params = useParams()
  const navigate = useNavigate()
  const listId = parseListId(params.listId)
  const scopeKey = listId == null ? 'all' : `list-${listId}`

  const { data, isLoading, isError, refetch } = useAgenda(listId)
  const { data: boards = [] } = useBoards()
  const completeMutation = useAgendaComplete(listId, user.id)
  const deadlineMutation = useAgendaUpdateDeadline(listId)

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

  useEffect(() => {
    try {
      localStorage.setItem(COLLAPSED_STORAGE_KEY, JSON.stringify(collapsed))
    } catch {
      // localStorage may be unavailable in private mode.
    }
  }, [collapsed])

  useEffect(() => {
    if (params.listId != null && listId == null) {
      navigate('/today', { replace: true })
    }
  }, [listId, navigate, params.listId])

  const wsToken = localStorage.getItem(AUTH_TOKEN_KEY)
  const realtimeBoardIds = useMemo(() => {
    if (listId != null) return [listId]
    return boards.map((board) => board.id)
  }, [boards, listId])
  useAgendaRealtime({ boardIds: realtimeBoardIds, listId, token: wsToken })

  const cards = useMemo(() => data?.cards ?? [], [data?.cards])
  const boundaries = data?.boundaries

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

  const completeBusy = completeMutation.isPending
  const deadlineBusy = deadlineMutation.isPending

  const toggleCollapsed = (group: AgendaGroupId) => {
    const key = `${scopeKey}:${group}`
    setCollapsed((prev) => ({ ...prev, [key]: prev[key] !== true }))
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

  if (isLoading) return <AgendaPageSkeleton />

  if (isError) {
    return (
      <PageShell width="2xl" spacing="md">
        <ErrorState action={{ label: 'Повторить', onClick: () => void refetch() }}>
          Не удалось загрузить агенду.
        </ErrorState>
      </PageShell>
    )
  }

  const emptyAgenda = cards.length === 0
  const emptyByFilter = !emptyAgenda && visibleCards.length === 0

  return (
    <div className="min-h-screen bg-background/80 pb-12 text-text">
      <AgendaHeader
        activeAssigneeId={activeAssigneeId}
        activeListId={listId}
        lists={boards.map((board) => ({ id: board.id, name: board.name, icon: board.icon }))}
        people={people}
        onAssigneeFilterChange={setActiveAssigneeId}
      />

      <main className="mx-auto w-full max-w-3xl px-4 pt-6 sm:px-6">
        <div aria-live="polite" role="status" className="sr-only">
          {announcement}
        </div>

        {emptyAgenda ? (
          <div className="flex min-h-[calc(100vh-15rem)] items-center justify-center">
            <EmptyState title="На сегодня всё спокойно" className="w-full max-w-md">
              Задач ни в одной группе нет. Новые задачи появятся здесь по мере добавления.
            </EmptyState>
          </div>
        ) : emptyByFilter ? (
          <EmptyState title="По фильтру ничего нет">
            У выбранного исполнителя нет задач в агенде.
          </EmptyState>
        ) : buckets ? (
          <div className="space-y-5">
            {AGENDA_GROUP_ORDER.map((group) => (
              <AgendaGroup
                key={group}
                boundaries={boundaries!}
                busy={completeBusy}
                cards={buckets[group]}
                collapsed={collapsed[`${scopeKey}:${group}`] === true}
                group={group}
                label={AGENDA_GROUP_LABELS[group]}
                onCompleteToggle={handleCompleteToggle}
                onDeadlineCommit={handleDeadlineCommit}
                onToggle={() => toggleCollapsed(group)}
                deadlineBusy={deadlineBusy}
              />
            ))}
          </div>
        ) : null}
      </main>
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
      <header className="sticky top-16 z-sticky flex h-14 items-center gap-3 border-b border-border/80 bg-background/78 px-4 backdrop-blur-xl sm:px-6">
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
