import { useEffect, useRef } from 'react'
import type { Card, Board, CardComment } from './api/types'

type ViteImportMeta = ImportMeta & { env?: { VITE_WS_BASE_URL?: string; VITE_API_BASE_URL?: string } }

function getWsBase(): string {
  const meta = import.meta as ViteImportMeta
  if (meta.env?.VITE_WS_BASE_URL) return meta.env.VITE_WS_BASE_URL
  // Derive from current page location
  const proto = window.location.protocol === 'https:' ? 'wss' : 'ws'
  return `${proto}://${window.location.host}`
}

export { getWsBase }

export type BoardEvent =
  | { type: 'card.created'; card: Card }
  | { type: 'card.updated'; card: Card }
  | { type: 'card.deleted'; card_id: number }
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

const RECONNECT_DELAY_MS = 3000

export function useBoardWebSocket({ boardId, token, onEvent, onOpen }: Options) {
  const wsRef = useRef<WebSocket | null>(null)
  const onEventRef = useRef(onEvent)
  onEventRef.current = onEvent
  const onOpenRef = useRef(onOpen)
  onOpenRef.current = onOpen

  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const unmountedRef = useRef(false)

  useEffect(() => {
    unmountedRef.current = false

    if (!token) return

    function connect() {
      if (unmountedRef.current) return
      const url = `${getWsBase()}/ws/boards/${boardId}/?token=${token}`
      const ws = new WebSocket(url)
      wsRef.current = ws

      ws.onopen = () => {
        onOpenRef.current?.()
      }

      ws.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data) as BoardEvent
          onEventRef.current(data)
        } catch {
          // ignore malformed messages
        }
      }

      ws.onclose = () => {
        if (!unmountedRef.current) {
          reconnectTimerRef.current = setTimeout(connect, RECONNECT_DELAY_MS)
        }
      }

      ws.onerror = () => {
        ws.close()
      }
    }

    connect()

    return () => {
      unmountedRef.current = true
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current)
      wsRef.current?.close()
    }
  }, [boardId, token])
}
