import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '../../../api/queries/keys'
import { getWsBase } from '../../../useBoardWebSocket'
import type { BoardEvent } from '../../../useBoardWebSocket'

const RECONNECT_DELAY_MS = 3000

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

    const sockets: WebSocket[] = []
    const timers: ReturnType<typeof setTimeout>[] = []
    let unmounted = false

    const invalidate = (event: BoardEvent) => {
      if (
        event.type === 'card.created' ||
        event.type === 'card.updated' ||
        event.type === 'card.moved' ||
        event.type === 'card.completed' ||
        event.type === 'card.deleted'
      ) {
        void qc.invalidateQueries({ queryKey: queryKeys.familyToday() })
      }
    }

    const connect = (boardId: number) => {
      const ws = new WebSocket(`${getWsBase()}/ws/boards/${boardId}/?token=${token}`)
      sockets.push(ws)

      ws.onmessage = (message) => {
        try {
          const data = JSON.parse(message.data) as BoardEvent
          invalidate(data)
        } catch {
          // ignore malformed messages
        }
      }

      ws.onclose = () => {
        if (!unmounted) {
          timers.push(setTimeout(() => connect(boardId), RECONNECT_DELAY_MS))
        }
      }

      ws.onerror = () => ws.close()
    }

    for (const id of ids) connect(id)

    return () => {
      unmounted = true
      timers.forEach((timer) => clearTimeout(timer))
      sockets.forEach((socket) => socket.close())
    }
  }, [boardIdsKey, qc, token])
}
