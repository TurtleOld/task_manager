import { useEffect, useRef } from 'react'
import { openBoardSocket } from './lib/boardSocket'
import type { BoardEvent } from './api/types'

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
