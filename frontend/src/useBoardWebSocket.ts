import { useEffect, useRef } from 'react'
import { openBoardSocket } from './lib/boardSocket'
import type { BoardEvent } from './api/types'

interface Options {
  boardId: number
  onEvent: (event: BoardEvent) => void
  onOpen?: () => void
}

export function useBoardWebSocket({ boardId, onEvent, onOpen }: Options) {
  const onEventRef = useRef(onEvent)
  onEventRef.current = onEvent
  const onOpenRef = useRef(onOpen)
  onOpenRef.current = onOpen

  useEffect(() => {
    return openBoardSocket({
      boardId,
      onEvent: (event) => onEventRef.current(event),
      onOpen: () => onOpenRef.current?.(),
    })
  }, [boardId])
}
