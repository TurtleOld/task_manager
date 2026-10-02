import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '../../../api/queries/keys'
import { toAgendaCard, upsertAgendaCard } from '../../../api/queries/agenda'
import type { AgendaResponse, BoardEvent } from '../../../api/types'
import { openBoardSocket } from '../../../lib/boardSocket'

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
    const applyCardEvent = (event: BoardEvent) => {
      if (event.type === 'card.updated' || event.type === 'card.completed') {
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

      if (event.type === 'card.deleted' || event.type === 'card.archived') {
        qc.setQueryData<AgendaResponse>(key, (prev) => {
          if (!prev) return prev
          return { ...prev, cards: prev.cards.filter((item) => item.id !== event.card_id) }
        })
      }
    }

    const closers = ids.map((boardId) =>
      openBoardSocket({ boardId, token, onEvent: applyCardEvent }),
    )

    return () => closers.forEach((close) => close())
  }, [boardIdsKey, listId, qc, token])
}
