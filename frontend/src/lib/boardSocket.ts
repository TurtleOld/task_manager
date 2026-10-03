import { clearLocalSession } from '../app/session'
import type { BoardEvent } from '../api/types'

type ViteImportMeta = ImportMeta & { env?: { VITE_WS_BASE_URL?: string } }

const RECONNECT_DELAY_MS = 3000
const SESSION_CLOSED_CODE = 4001

export function getWsBase(): string {
  const meta = import.meta as ViteImportMeta
  if (meta.env?.VITE_WS_BASE_URL) return meta.env.VITE_WS_BASE_URL
  const proto = window.location.protocol === 'https:' ? 'wss' : 'ws'
  return `${proto}://${window.location.host}`
}

interface BoardSocketOptions {
  boardId: number
  token: string
  onEvent: (event: BoardEvent) => void
  onOpen?: (isReconnect: boolean) => void
}

/**
 * Keeps a WebSocket to a board channel open, reconnecting after drops.
 * Returns a function that closes it for good. A 4001 close means the session
 * is gone, so it triggers the local cleanup instead of reconnecting.
 */
export function openBoardSocket({ boardId, token, onEvent, onOpen }: BoardSocketOptions): () => void {
  let ws: WebSocket | null = null
  let timer: ReturnType<typeof setTimeout> | null = null
  let closed = false
  let reconnecting = false

  const connect = () => {
    if (closed) return
    const socket = new WebSocket(`${getWsBase()}/ws/boards/${boardId}/?token=${token}`)
    ws = socket

    socket.onopen = () => onOpen?.(reconnecting)

    socket.onmessage = (message) => {
      try {
        onEvent(JSON.parse(message.data) as BoardEvent)
      } catch {
        // ignore malformed messages
      }
    }

    socket.onclose = (event) => {
      if (closed) return
      if (event.code === SESSION_CLOSED_CODE) {
        closed = true
        void clearLocalSession()
        return
      }
      reconnecting = true
      timer = setTimeout(connect, RECONNECT_DELAY_MS)
    }

    socket.onerror = () => socket.close()
  }

  connect()

  return () => {
    closed = true
    if (timer) clearTimeout(timer)
    ws?.close()
  }
}
