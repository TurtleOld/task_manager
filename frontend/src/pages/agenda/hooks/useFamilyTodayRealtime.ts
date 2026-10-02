import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '../../../api/queries/keys'
import type { BoardEvent } from '../../../api/types'
import { openBoardSocket } from '../../../lib/boardSocket'

interface FamilyTodayRealtimeOptions {
  boardIds: number[]
  token: string | null
}

// Панель охватывает всю семью, поэтому слушает каналы всех списков, а не
// только открытый в агенде. Снимок агрегированный (счётчики, чек-лист),
// точечный патч кэша не окупается — события просто его инвалидируют.
export function useFamilyTodayRealtime({ boardIds, token }: FamilyTodayRealtimeOptions) {
  const qc = useQueryClient()
  const boardIdsKey = boardIds.join(',')

  useEffect(() => {
    if (!token || !boardIdsKey) return

    const ids = boardIdsKey
      .split(',')
      .map((value) => Number(value))
      .filter((value) => Number.isFinite(value) && value > 0)
    if (ids.length === 0) return

    const invalidate = (event: BoardEvent) => {
      if (
        event.type === 'card.created' ||
        event.type === 'card.updated' ||
        event.type === 'card.completed' ||
        event.type === 'card.deleted' ||
        event.type === 'card.archived'
      ) {
        void qc.invalidateQueries({ queryKey: queryKeys.familyToday() })
      }
    }

    const closers = ids.map((boardId) =>
      openBoardSocket({ boardId, token, onEvent: invalidate }),
    )

    return () => closers.forEach((close) => close())
  }, [boardIdsKey, qc, token])
}
