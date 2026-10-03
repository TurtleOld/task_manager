import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '../../../api/queries/keys'
import type { BoardEvent, Card, CardComment } from '../../../api/types'
import { shouldApplyCardVersion } from '../../../lib/cardVersion'
import { openBoardSocket } from '../../../lib/boardSocket'

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
    const applyCard = (card: Card) => {
      if (card.id !== taskId) return
      const current = qc.getQueryData<Card>(key)
      if (!shouldApplyCardVersion(card.version, current?.version)) return
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

    return openBoardSocket({
      boardId,
      token,
      onEvent: (event) => {
        if (event.type === 'card.updated' || event.type === 'card.completed') {
          applyCard(event.card)
        } else {
          applyComment(event)
        }
      },
      // Events published while the socket was down are lost, so a reconnect
      // can only be healed by refetching the task and its comments.
      onOpen: (isReconnect) => {
        if (!isReconnect) return
        void qc.invalidateQueries({ queryKey: key })
        void qc.invalidateQueries({ queryKey: commentsKey })
      },
    })
  }, [boardId, taskId, token, qc])
}
