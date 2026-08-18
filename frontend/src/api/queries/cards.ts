import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../client'
import type { ArchiveResponse, Card, MyTodayCard, MyTodayResponse } from '../types'
import { queryKeys } from './keys'

type UpdateCardPayload = Parameters<typeof api.updateCard>[1]

function upsertCard(cards: Card[] | undefined, card: Card) {
  if (!cards) return [card]
  if (cards.some((item) => item.id === card.id)) {
    return cards.map((item) => (item.id === card.id ? card : item))
  }
  return [...cards, card]
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

export function useArchive(boardId?: number) {
  return useQuery<ArchiveResponse>({
    queryKey: queryKeys.archive(boardId),
    queryFn: () => api.listArchive(boardId),
  })
}

export function useRestoreArchiveCard(boardId?: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => api.restoreCard(id),
    onSuccess: (card) => {
      qc.setQueryData<ArchiveResponse>(queryKeys.archive(boardId), (prev) => {
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
    mutationFn: (id: number) => api.completeCard(id),
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
