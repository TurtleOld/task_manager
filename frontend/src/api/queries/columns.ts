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
