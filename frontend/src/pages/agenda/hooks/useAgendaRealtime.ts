import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '../../../api/queries/keys'
import { toAgendaCard, upsertAgendaCard } from '../../../api/queries/agenda'
import type { AgendaResponse } from '../../../api/types'
import { getWsBase } from '../../../useBoardWebSocket'
import type { BoardEvent } from '../../../useBoardWebSocket'

const RECONNECT_DELAY_MS = 3000

interface AgendaRealtimeOptions {
  boardIds: number[]
  listId?: number | null
  token: string | null
}

/**
 * Реалтайм для агенды. Открывает по одному WebSocket на список (существующий
 * per-board канал) и применяет события к кэшу агенды: выполнение, изменение
 * срока, создание и удаление задачи видны без перезагрузки.
 */
export function useAgendaRealtime({ boardIds, listId, token }: AgendaRealtimeOptions) {
  const qc = useQueryClient()
  const boardIdsKey = boardIds.join(',')

  useEffect(() => {
    if (!token || !boardIdsKey) return

    const ids = boardIdsKey
      .split(',')
      .map((value) => Number(value))
      .filter((value) => Number.isFinite(value) && value > 0)
    if (ids.length === 0) return

    const key = queryKeys.agenda(listId ?? undefined)
    const sockets: WebSocket[] = []
    const timers: ReturnType<typeof setTimeout>[] = []
    let unmounted = false

    const applyCardEvent = (event: BoardEvent) => {
      if (event.type === 'card.updated' || event.type === 'card.moved' || event.type === 'card.completed') {
        qc.setQueryData<AgendaResponse>(key, (prev) => {
          if (!prev) return prev
          if (!prev.cards.some((item) => item.id === event.card.id)) return prev
          return { ...prev, cards: upsertAgendaCard(prev.cards, toAgendaCard(event.card)) }
        })
        return
      }

      if (event.type === 'card.created') {
        const card = event.card
        if (card.archived_at || card.parent != null) return
        if (listId != null && card.board !== listId) return
        qc.setQueryData<AgendaResponse>(key, (prev) => {
          if (!prev) return prev
          if (prev.cards.some((item) => item.id === card.id)) return prev
          return { ...prev, cards: upsertAgendaCard(prev.cards, toAgendaCard(card)) }
        })
        return
      }

      if (event.type === 'card.deleted') {
        qc.setQueryData<AgendaResponse>(key, (prev) => {
          if (!prev) return prev
          return { ...prev, cards: prev.cards.filter((item) => item.id !== event.card_id) }
        })
      }
    }

    const connect = (boardId: number) => {
      const ws = new WebSocket(`${getWsBase()}/ws/boards/${boardId}/?token=${token}`)
      sockets.push(ws)

      ws.onmessage = (message) => {
        try {
          const data = JSON.parse(message.data) as BoardEvent
          applyCardEvent(data)
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
  }, [boardIdsKey, listId, qc, token])
}
