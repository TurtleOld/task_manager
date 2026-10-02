import { useEffect, useRef } from 'react'
import { openBoardSocket } from './lib/boardSocket'
import type { Card, Board, CardComment } from './api/types'

export type BoardEvent =
  | { type: 'card.created'; card: Card }
  | { type: 'card.updated'; card: Card }
  | { type: 'card.deleted'; card_id: number }
  | { type: 'card.archived'; card_id: number }
  | { type: 'card.completed'; card: Card }
  | { type: 'comment.created'; card_id: number; comment: CardComment }
  | { type: 'comment.updated'; card_id: number; comment: CardComment }
  | { type: 'comment.deleted'; card_id: number; comment_id: number }
  | { type: 'board.created'; board: Board }
  | { type: 'board.updated'; board: Board }
  | { type: 'board.deleted'; board_id: number }

interface Options {
  boardId: number
  token: string | null
  onEvent: (event: BoardEvent) => void
  onOpen?: () => void
}

export function useBoardWebSocket({ boardId, token, onEvent, onOpen }: Options) {
  const onEventRef = useRef(onEvent)
  onEventRef.current = onEvent
  const onOpenRef = useRef(onOpen)
  onOpenRef.current = onOpen

  useEffect(() => {
    if (!token) return
    return openBoardSocket({
      boardId,
      token,
      onEvent: (event) => onEventRef.current(event),
      onOpen: () => onOpenRef.current?.(),
    })
  }, [boardId, token])
}
