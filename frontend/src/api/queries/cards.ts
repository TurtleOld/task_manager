import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../client'
import type { Card, InboxResponse, MyTodayCard, MyTodayResponse } from '../types'
import { queryKeys } from './keys'

type UpdateCardPayload = Parameters<typeof api.updateCard>[1]
type MoveCardPayload = Parameters<typeof api.moveCard>[1]

function upsertCard(cards: Card[] | undefined, card: Card) {
  if (!cards) return [card]
  if (cards.some((item) => item.id === card.id)) {
    return cards.map((item) => (item.id === card.id ? card : item))
  }
  return [...cards, card]
}

export function useCards(boardId: number) {
  return useQuery<Card[]>({
    queryKey: queryKeys.cards(boardId),
    queryFn: () => api.listCardsByBoard(boardId),
    enabled: Number.isFinite(boardId) && boardId > 0,
  })
}

export function useCalendarCards() {
  return useQuery<Card[]>({
    queryKey: queryKeys.calendarCards(),
    queryFn: api.listCards,
    select: (cards) => cards.filter((card) => Boolean(card.deadline)),
  })
}

export function useUpdateCalendarCard() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: UpdateCardPayload }) =>
      api.updateCard(id, payload),
    onSuccess: (card) => {
      qc.setQueryData<Card[]>(queryKeys.calendarCards(), (prev) => upsertCard(prev, card))
      qc.setQueryData<Card[]>(queryKeys.cards(card.board), (prev) => upsertCard(prev, card))
      void qc.invalidateQueries({ queryKey: queryKeys.myToday() })
    },
  })
}

export function useCreateCalendarCard() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: Parameters<typeof api.createCardWithDetails>[0]) =>
      api.createCardWithDetails(payload),
    onSuccess: (card) => {
      qc.setQueryData<Card[]>(queryKeys.calendarCards(), (prev) => upsertCard(prev, card))
      qc.setQueryData<Card[]>(queryKeys.cards(card.board), (prev) => upsertCard(prev, card))
      void qc.invalidateQueries({ queryKey: queryKeys.myToday() })
    },
  })
}

export function useInbox() {
  return useQuery<InboxResponse>({
    queryKey: queryKeys.inbox(),
    queryFn: api.getInbox,
  })
}

export function useCreateInboxCard() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: Parameters<typeof api.createInboxCard>[0]) => api.createInboxCard(payload),
    onSuccess: (card) => {
      qc.setQueryData<InboxResponse>(queryKeys.inbox(), (prev) => {
        if (!prev) return prev
        return { ...prev, cards: upsertCard(prev.cards, card) }
      })
      void qc.invalidateQueries({ queryKey: queryKeys.myToday() })
    },
  })
}

export function useMoveInboxCard() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, toColumn }: { id: number; toColumn: number }) =>
      api.moveCard(id, { to_column: toColumn }),
    onSuccess: (card) => {
      qc.setQueryData<InboxResponse>(queryKeys.inbox(), (prev) => {
        if (!prev) return prev
        return { ...prev, cards: prev.cards.filter((item) => item.id !== card.id) }
      })
      qc.setQueryData<Card[]>(queryKeys.cards(card.board), (prev) => upsertCard(prev, card))
      void qc.invalidateQueries({ queryKey: queryKeys.myToday() })
      void qc.invalidateQueries({ queryKey: queryKeys.calendarCards() })
    },
  })
}

export function useMyToday() {
  return useQuery<MyTodayResponse>({
    queryKey: queryKeys.myToday(),
    queryFn: api.listMyToday,
  })
}

export function useCompleteTodayCard() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ card, doneColumn }: { card: MyTodayCard; doneColumn: number }) =>
      api.moveCard(card.id, { to_column: doneColumn }),
    onSuccess: (updated) => {
      qc.setQueryData<MyTodayResponse>(queryKeys.myToday(), (prev) => {
        if (!prev) return prev
        const removeCard = (cards: MyTodayCard[]) => cards.filter((card) => card.id !== updated.id)
        return {
          overdue: removeCard(prev.overdue),
          today: removeCard(prev.today),
          important: removeCard(prev.important),
        }
      })
      qc.setQueryData<Card[]>(queryKeys.cards(updated.board), (prev) =>
        prev?.map((card) => (card.id === updated.id ? updated : card)),
      )
      void qc.invalidateQueries({ queryKey: queryKeys.myToday() })
    },
  })
}

export function useCreateCard(boardId: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      column,
      title,
      description,
    }: {
      column: number
      title: string
      description?: string
    }) => api.createCard(column, title, description),
    onSuccess: (card) => {
      qc.setQueryData<Card[]>(queryKeys.cards(boardId), (prev) => {
        if (!prev) return [card]
        if (prev.some((c) => c.id === card.id)) return prev
        return [...prev, card]
      })
    },
  })
}

export function useUpdateCard(boardId: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: UpdateCardPayload }) =>
      api.updateCard(id, payload),
    onSuccess: (card) => {
      qc.setQueryData<Card[]>(queryKeys.cards(boardId), (prev) =>
        prev?.map((c) => (c.id === card.id ? card : c)),
      )
    },
  })
}

export function useDeleteCard(boardId: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => api.deleteCard(id),
    onSuccess: (_, id) => {
      qc.setQueryData<Card[]>(queryKeys.cards(boardId), (prev) =>
        prev?.filter((c) => c.id !== id),
      )
    },
  })
}

type MoveContext = { previous: Card[] | undefined }

export function useMoveCard(boardId: number) {
  const qc = useQueryClient()
  return useMutation<
    Card,
    Error,
    { id: number; payload: MoveCardPayload; optimistic?: (cards: Card[]) => Card[] },
    MoveContext
  >({
    mutationFn: ({ id, payload }) => api.moveCard(id, payload),
    onMutate: async ({ optimistic }) => {
      await qc.cancelQueries({ queryKey: queryKeys.cards(boardId) })
      const previous = qc.getQueryData<Card[]>(queryKeys.cards(boardId))
      if (optimistic && previous) {
        qc.setQueryData<Card[]>(queryKeys.cards(boardId), optimistic(previous))
      }
      return { previous }
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) {
        qc.setQueryData(queryKeys.cards(boardId), ctx.previous)
      }
    },
    onSuccess: (updated) => {
      qc.setQueryData<Card[]>(queryKeys.cards(boardId), (prev) =>
        prev?.map((c) => (c.id === updated.id ? updated : c)),
      )
    },
  })
}

export function useUploadCardAttachments(boardId: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, files }: { id: number; files: File[] }) =>
      api.uploadCardAttachments(id, files),
    onSuccess: (card) => {
      qc.setQueryData<Card[]>(queryKeys.cards(boardId), (prev) =>
        prev?.map((c) => (c.id === card.id ? card : c)),
      )
    },
  })
}

export function useDeleteCardAttachment(boardId: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, attachmentId }: { id: number; attachmentId: string }) =>
      api.deleteCardAttachment(id, attachmentId),
    onSuccess: (card) => {
      qc.setQueryData<Card[]>(queryKeys.cards(boardId), (prev) =>
        prev?.map((c) => (c.id === card.id ? card : c)),
      )
    },
  })
}
