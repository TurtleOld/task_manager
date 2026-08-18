import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '../../../api/queries/keys'
import type { Card, CardComment } from '../../../api/types'
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
    const commentsKey = queryKeys.cardComments(taskId)
    let ws: WebSocket | null = null
    let timer: ReturnType<typeof setTimeout> | null = null
    let unmounted = false

    const applyCard = (card: Card) => {
      if (card.id !== taskId) return
      qc.setQueryData<Card>(key, card)
    }

    const applyComment = (event: BoardEvent) => {
      if (event.type !== 'comment.created' && event.type !== 'comment.updated' && event.type !== 'comment.deleted') return
      if (event.card_id !== taskId) return
      qc.setQueryData<CardComment[]>(commentsKey, (prev) => {
        if (!prev) return prev
        if (event.type === 'comment.created') {
          return prev.some((item) => item.id === event.comment.id) ? prev : [...prev, event.comment]
        }
        if (event.type === 'comment.updated') {
          return prev.map((item) => (item.id === event.comment.id ? event.comment : item))
        }
        return prev.filter((item) => item.id !== event.comment_id)
      })
    }

    const connect = () => {
      if (unmounted) return
      ws = new WebSocket(`${getWsBase()}/ws/boards/${boardId}/?token=${token}`)

      ws.onmessage = (message) => {
        try {
          const data = JSON.parse(message.data) as BoardEvent
          if (data.type === 'card.updated' || data.type === 'card.completed') {
            applyCard(data.card)
          } else {
            applyComment(data)
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
