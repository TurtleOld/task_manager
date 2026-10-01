import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '../../../api/queries/keys'
import { toAgendaCard, upsertAgendaCard } from '../../../api/queries/agenda'
import type { AgendaResponse } from '../../../api/types'
import { shouldApplyCardVersion } from '../../../lib/cardVersion'
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
      if (event.type === 'card.updated' || event.type === 'card.completed') {
        const next = toAgendaCard(event.card)
        qc.setQueryData<AgendaResponse>(key, (prev) => {
          if (!prev) return prev
          const current = prev.cards.find((item) => item.id === event.card.id)
          if (!current) return prev
          if (!shouldApplyCardVersion(next.version, current.version)) return prev
          return { ...prev, cards: upsertAgendaCard(prev.cards, next) }
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

      if (event.type === 'card.deleted' || event.type === 'card.archived') {
        qc.setQueryData<AgendaResponse>(key, (prev) => {
          if (!prev) return prev
          return { ...prev, cards: prev.cards.filter((item) => item.id !== event.card_id) }
        })
      }
    }

    const connect = (boardId: number, isReconnect: boolean) => {
      const ws = new WebSocket(`${getWsBase()}/ws/boards/${boardId}/?token=${token}`)
      sockets.push(ws)

      ws.onopen = () => {
        // The socket carries no sequence number, so anything published while it
        // was down is lost. A reconnect can only be healed by a full refetch.
        if (isReconnect) void qc.invalidateQueries({ queryKey: key })
      }

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
          timers.push(setTimeout(() => connect(boardId, true), RECONNECT_DELAY_MS))
        }
      }

      ws.onerror = () => ws.close()
    }

    for (const id of ids) connect(id, false)

    // A PWA resumed from the background keeps its WebSocket open but stops
    // receiving for a while, so the cached agenda can be stale by the time the
    // screen comes back.
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void qc.invalidateQueries({ queryKey: key })
      }
    }
    document.addEventListener('visibilitychange', onVisibilityChange)

    return () => {
      unmounted = true
      document.removeEventListener('visibilitychange', onVisibilityChange)
      timers.forEach((timer) => clearTimeout(timer))
      sockets.forEach((socket) => socket.close())
    }
  }, [boardIdsKey, listId, qc, token])
}
