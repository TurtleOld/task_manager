import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../client'
import type { Board, BoardTemplate } from '../types'
import { queryKeys } from './keys'

export function useBoards() {
  return useQuery<Board[]>({
    queryKey: queryKeys.boards(),
    queryFn: () => api.listBoards(),
  })
}

export function useBoardTemplates() {
  return useQuery<BoardTemplate[]>({
    queryKey: queryKeys.boardTemplates(),
    queryFn: () => api.listBoardTemplates(),
  })
}

export function useBoard(boardId: number) {
  return useQuery<Board | undefined>({
    queryKey: ['board', boardId],
    queryFn: async () => {
      const boards = await api.listBoards()
      return boards.find((b) => b.id === boardId)
    },
    enabled: Number.isFinite(boardId) && boardId > 0,
  })
}

export function useCreateBoard() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: { name: string; icon?: string; color?: string }) => api.createBoard(payload),
    onSuccess: (board) => {
      qc.setQueryData<Board[]>(queryKeys.boards(), (prev) =>
        prev ? [...prev, board] : [board],
      )
    },
  })
}

export function useCreateBoardFromTemplate() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: Parameters<typeof api.createBoardFromTemplate>[0]) =>
      api.createBoardFromTemplate(payload),
    onSuccess: (board) => {
      qc.setQueryData<Board[]>(queryKeys.boards(), (prev) =>
        prev ? [...prev, board] : [board],
      )
    },
  })
}

export function useUpdateBoard() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      id,
      payload,
    }: {
      id: number
      payload: Partial<{ name: string; icon: string; color: string }>
    }) => api.updateBoard(id, payload),
    onSuccess: (board) => {
      qc.setQueryData<Board[]>(queryKeys.boards(), (prev) =>
        prev?.map((b) => (b.id === board.id ? board : b)),
      )
    },
  })
}
