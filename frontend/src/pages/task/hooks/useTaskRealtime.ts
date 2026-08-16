import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '../../../api/queries/keys'
import type { Card } from '../../../api/types'
import { getWsBase } from '../../../useBoardWebSocket'
import type { BoardEvent } from '../../../useBoardWebSocket'

const RECONNECT_DELAY_MS = 3000

interface TaskRealtimeOptions {
  boardId: number | null
  taskId: number | null
  token: string | null
}

/**
 * Реалтайм для открытого экрана задачи. Слушает канал списка (тот же, что
 * агенда) и подменяет карточку задачи целиком при событии сервера — так
 * отметка родителя, закрывающая подзадачи, видна без перезагрузки: сервер
 * присылает родителя с уже обновлённым `subtasks`.
 */
export function useTaskRealtime({ boardId, taskId, token }: TaskRealtimeOptions) {
  const qc = useQueryClient()

  useEffect(() => {
    if (!token || boardId == null || taskId == null) return

    const key = queryKeys.card(taskId)
    let ws: WebSocket | null = null
    let timer: ReturnType<typeof setTimeout> | null = null
    let unmounted = false

    const applyCard = (card: Card) => {
      if (card.id !== taskId) return
      qc.setQueryData<Card>(key, card)
    }

    const connect = () => {
      if (unmounted) return
      ws = new WebSocket(`${getWsBase()}/ws/boards/${boardId}/?token=${token}`)

      ws.onmessage = (message) => {
        try {
          const data = JSON.parse(message.data) as BoardEvent
          if (data.type === 'card.updated' || data.type === 'card.moved' || data.type === 'card.completed') {
            applyCard(data.card)
          }
        } catch {
          // ignore malformed messages
        }
      }

      ws.onclose = () => {
        if (!unmounted) timer = setTimeout(connect, RECONNECT_DELAY_MS)
      }
      ws.onerror = () => ws?.close()
    }

    connect()

    return () => {
      unmounted = true
      if (timer) clearTimeout(timer)
      ws?.close()
    }
  }, [boardId, taskId, token, qc])
}
