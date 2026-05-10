import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../client'
import type { Card } from '../types'
import { queryKeys } from './keys'

type UpdateCardPayload = Parameters<typeof api.updateCard>[1]
type MoveCardPayload = Parameters<typeof api.moveCard>[1]

export function useCards(boardId: number) {
  return useQuery<Card[]>({
    queryKey: queryKeys.cards(boardId),
    queryFn: () => api.listCardsByBoard(boardId),
    enabled: Number.isFinite(boardId) && boardId > 0,
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
