import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../client'
import type { AgendaCard, AgendaResponse, AgendaUser, Card, FamilyTodayResponse } from '../types'
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
    is_recurring: card.recurrence != null,
    created_at: card.created_at,
  }
}

/** Карточка-заглушка для оптимистичной вставки до ответа сервера (быстрое добавление). */
export function makeAgendaPlaceholderCard(params: {
  id: number
  title: string
  list: number
  deadline: string | null
  assignee: { id: number; name: string } | null
}): AgendaCard {
  return {
    id: params.id,
    title: params.title,
    list: params.list,
    deadline: params.deadline,
    priority: 0,
    assignee: params.assignee != null ? { id: params.assignee.id, username: '', full_name: params.assignee.name } : null,
    completed_at: null,
    completed_by: null,
    has_subtasks: false,
    has_checklist: false,
    is_recurring: false,
    created_at: new Date().toISOString(),
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

/**
 * Быстрое добавление задачи из строки агенды. Оптимистично: карточка-заглушка
 * появляется в своей группе сразу, заменяется настоящей после ответа сервера;
 * при ошибке заглушка убирается.
 */
export function useAgendaCreateCard(listId: number) {
  const qc = useQueryClient()
  const key = queryKeys.agenda(listId)
  return useMutation<
    Card,
    Error,
    { payload: Parameters<typeof api.createCardWithDetails>[0]; placeholder: AgendaCard },
    AgendaMutationContext
  >({
    mutationFn: ({ payload }) => api.createCardWithDetails(payload),
    onMutate: async ({ placeholder }) => {
      await qc.cancelQueries({ queryKey: key })
      const previous = qc.getQueryData<AgendaResponse>(key)
      qc.setQueryData<AgendaResponse>(key, (prev) =>
        prev ? { ...prev, cards: [...prev.cards, placeholder] } : prev,
      )
      return { previous }
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) qc.setQueryData(key, ctx.previous)
    },
    onSuccess: (card, { placeholder }) => {
      qc.setQueryData<AgendaResponse>(key, (prev) => {
        if (!prev) return prev
        const withoutTemp = prev.cards.filter((item) => item.id !== placeholder.id)
        return { ...prev, cards: upsertAgendaCard(withoutTemp, toAgendaCard(card)) }
      })
    },
  })
}

/**
 * Данные правой панели «Сегодня у семьи» — всегда по всей семье, без учёта
 * охвата агенды. На узких экранах панель недоступна (тикет 10), поэтому
 * запрос можно отключить через `enabled`, чтобы не тратить его впустую.
 */
export function useFamilyToday(options: { enabled?: boolean } = {}) {
  return useQuery<FamilyTodayResponse>({
    queryKey: queryKeys.familyToday(),
    queryFn: () => api.getFamilyToday(),
    enabled: options.enabled ?? true,
  })
}

/**
 * Отметка пункта общего чек-листа покупок прямо из панели, без открытия
 * задачи. Оптимистично: пункт перечёркивается сразу, откатывается при ошибке.
 */
export function useFamilyShoppingItemToggle() {
  const qc = useQueryClient()
  const key = queryKeys.familyToday()
  return useMutation<
    void,
    Error,
    { cardId: number; itemId: number; done: boolean },
    { previous: FamilyTodayResponse | undefined }
  >({
    mutationFn: ({ cardId, itemId, done }) => api.updateChecklistItem(cardId, itemId, { done }).then(() => undefined),
    onMutate: async ({ itemId, done }) => {
      await qc.cancelQueries({ queryKey: key })
      const previous = qc.getQueryData<FamilyTodayResponse>(key)
      qc.setQueryData<FamilyTodayResponse>(key, (prev) => {
        if (!prev?.shopping_list) return prev
        return {
          ...prev,
          shopping_list: {
            ...prev.shopping_list,
            items: prev.shopping_list.items.map((item) => (item.id === itemId ? { ...item, done } : item)),
          },
        }
      })
      return { previous }
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) qc.setQueryData(key, ctx.previous)
    },
  })
}
