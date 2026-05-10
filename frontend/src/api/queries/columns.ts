import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../client'
import type { Column } from '../types'
import { queryKeys } from './keys'

export function useColumns(boardId: number) {
  return useQuery<Column[]>({
    queryKey: queryKeys.columns(boardId),
    queryFn: () => api.listColumns(boardId),
    enabled: Number.isFinite(boardId) && boardId > 0,
  })
}

export function useCreateColumn(boardId: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ name, icon }: { name: string; icon: string }) =>
      api.createColumn(boardId, name, icon),
    onSuccess: (column) => {
      qc.setQueryData<Column[]>(queryKeys.columns(boardId), (prev) =>
        prev ? [...prev, column] : [column],
      )
    },
  })
}

type MoveColumnContext = { previous: Column[] | undefined }

export function useMoveColumn(boardId: number) {
  const qc = useQueryClient()
  return useMutation<
    Column,
    Error,
    { id: number; payload: Parameters<typeof api.moveColumn>[1]; optimistic?: (columns: Column[]) => Column[] },
    MoveColumnContext
  >({
    mutationFn: ({ id, payload }) => api.moveColumn(id, payload),
    onMutate: async ({ optimistic }) => {
      await qc.cancelQueries({ queryKey: queryKeys.columns(boardId) })
      const previous = qc.getQueryData<Column[]>(queryKeys.columns(boardId))
      if (optimistic && previous) {
        qc.setQueryData<Column[]>(queryKeys.columns(boardId), optimistic(previous))
      }
      return { previous }
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) qc.setQueryData(queryKeys.columns(boardId), ctx.previous)
    },
    onSuccess: (updated) => {
      qc.setQueryData<Column[]>(queryKeys.columns(boardId), (prev) =>
        prev?.map((column) => (column.id === updated.id ? updated : column)),
      )
    },
  })
}
