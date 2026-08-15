import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../client'
import type { AgendaCard, AgendaResponse, AgendaUser, Card } from '../types'
import { queryKeys } from './keys'

function hasUserName(user: AgendaUser | null): boolean {
  return user != null && Boolean(user.full_name || user.username)
}

/**
 * Полный сериализатор задачи (вебсокет, ответы мутаций) отдаёт исполнителя
 * только id-ом. При подмене задачи в кэше агенды сохраняем имена, которые уже
 * пришли с `/agenda/`, чтобы аватар не деградировал до инициала «?».
 */
function withPreservedUsers(current: AgendaCard | undefined, next: AgendaCard): AgendaCard {
  if (!current) return next
  return {
    ...next,
    assignee: hasUserName(next.assignee) ? next.assignee : current.assignee,
    completed_by: hasUserName(next.completed_by) ? next.completed_by : current.completed_by,
  }
}

export function toAgendaCard(card: Card): AgendaCard {
  return {
    id: card.id,
    title: card.title,
    list: card.board,
    deadline: card.deadline,
    priority: card.priority,
    priority_label: card.priority_label,
    assignee: card.assignee != null ? { id: card.assignee, username: '', full_name: null } : null,
    completed_at: card.completed_at ?? null,
    completed_by:
      card.completed_by != null ? { id: card.completed_by, username: '', full_name: null } : null,
    has_subtasks: (card.subtasks?.length ?? 0) > 0,
    has_checklist: (card.checklist?.length ?? 0) > 0,
    created_at: card.created_at,
  }
}

export function upsertAgendaCard(cards: AgendaCard[] | undefined, card: AgendaCard): AgendaCard[] {
  if (!cards) return [card]
  if (cards.some((item) => item.id === card.id)) {
    return cards.map((item) => (item.id === card.id ? withPreservedUsers(item, card) : item))
  }
  return [...cards, card]
}

export function useAgenda(listId?: number | null) {
  return useQuery<AgendaResponse>({
    queryKey: queryKeys.agenda(listId ?? undefined),
    queryFn: () => api.getAgenda(listId ?? undefined),
  })
}

type AgendaMutationContext = { previous: AgendaResponse | undefined }

function setAgendaCard(qc: ReturnType<typeof useQueryClient>, key: readonly unknown[], card: AgendaCard) {
  qc.setQueryData<AgendaResponse>(key, (prev) => {
    if (!prev) return prev
    return { ...prev, cards: upsertAgendaCard(prev.cards, card) }
  })
}

/**
 * Отметка выполненной / снятие отметки. Оптимистично: строка перечёркивается
 * сразу, при ошибке состояние откатывается к прежнему.
 */
export function useAgendaComplete(listId?: number | null, currentUserId?: number | null) {
  const qc = useQueryClient()
  const key = queryKeys.agenda(listId ?? undefined)
  return useMutation<Card, Error, { id: number; complete: boolean }, AgendaMutationContext>({
    mutationFn: ({ id, complete }) => (complete ? api.completeCard(id) : api.uncompleteCard(id)),
    onMutate: async ({ id, complete }) => {
      await qc.cancelQueries({ queryKey: key })
      const previous = qc.getQueryData<AgendaResponse>(key)
      qc.setQueryData<AgendaResponse>(key, (prev) => {
        if (!prev) return prev
        return {
          ...prev,
          cards: prev.cards.map((card) =>
            card.id === id
              ? {
                  ...card,
                  completed_at: complete ? new Date().toISOString() : null,
                  completed_by:
                    complete && currentUserId != null
                      ? { id: currentUserId, username: '', full_name: null }
                      : null,
                }
              : card,
          ),
        }
      })
      return { previous }
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) qc.setQueryData(key, ctx.previous)
    },
    onSuccess: (card) => {
      setAgendaCard(qc, key, toAgendaCard(card))
    },
  })
}

/**
 * Перенос срока. Оптимистично: задача мгновенно переезжает в другую группу,
 * без перезапроса; при ошибке срок откатывается.
 */
export function useAgendaUpdateDeadline(listId?: number | null) {
  const qc = useQueryClient()
  const key = queryKeys.agenda(listId ?? undefined)
  return useMutation<Card, Error, { id: number; deadline: string | null }, AgendaMutationContext>({
    mutationFn: ({ id, deadline }) => api.updateCard(id, { deadline }),
    onMutate: async ({ id, deadline }) => {
      await qc.cancelQueries({ queryKey: key })
      const previous = qc.getQueryData<AgendaResponse>(key)
      qc.setQueryData<AgendaResponse>(key, (prev) => {
        if (!prev) return prev
        return {
          ...prev,
          cards: prev.cards.map((card) => (card.id === id ? { ...card, deadline } : card)),
        }
      })
      return { previous }
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) qc.setQueryData(key, ctx.previous)
    },
    onSuccess: (card) => {
      setAgendaCard(qc, key, toAgendaCard(card))
    },
  })
}
