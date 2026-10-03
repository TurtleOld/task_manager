import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const clearLocalSession = vi.fn()
vi.mock('../app/session', () => ({ clearLocalSession }))

const { openBoardSocket } = await import('./boardSocket')

class FakeSocket {
  static instances: FakeSocket[] = []
  onopen: (() => void) | null = null
  onmessage: ((message: { data: string }) => void) | null = null
  onclose: ((event: { code: number }) => void) | null = null
  onerror: (() => void) | null = null
  close = vi.fn()
  constructor(
    readonly url: string,
    readonly protocols?: string[],
  ) {
    FakeSocket.instances.push(this)
  }
}

const first = () => FakeSocket.instances[0]!

beforeEach(() => {
  FakeSocket.instances = []
  vi.useFakeTimers()
  vi.stubGlobal('WebSocket', FakeSocket)
  vi.stubGlobal('window', { location: { protocol: 'https:', host: 'example.test' } })
  vi.stubGlobal('document', { cookie: 'csrftoken=csrf-secret' })
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

describe('openBoardSocket', () => {
  it('connects with the CSRF token as a subprotocol and delivers parsed events', () => {
    const onEvent = vi.fn()
    openBoardSocket({ boardId: 7, onEvent })

    const socket = first()
    expect(socket.url).toBe('wss://example.test/ws/boards/7/')
    expect(socket.protocols).toEqual(['tm.v1', 'csrf-secret'])
    socket.onmessage?.({ data: JSON.stringify({ type: 'card.deleted', card_id: 1 }) })
    socket.onmessage?.({ data: 'not json' })

    expect(onEvent).toHaveBeenCalledExactlyOnceWith({ type: 'card.deleted', card_id: 1 })
  })

  it('reconnects after an ordinary close', () => {
    openBoardSocket({ boardId: 1, onEvent: vi.fn() })

    first().onclose?.({ code: 1006 })
    vi.advanceTimersByTime(3000)

    expect(FakeSocket.instances).toHaveLength(2)
    expect(clearLocalSession).not.toHaveBeenCalled()
  })

  it('tells onOpen whether the socket is a reconnect', () => {
    const onOpen = vi.fn()
    openBoardSocket({ boardId: 1, onEvent: vi.fn(), onOpen })

    first().onopen?.()
    first().onclose?.({ code: 1006 })
    vi.advanceTimersByTime(3000)
    FakeSocket.instances[1]!.onopen?.()

    expect(onOpen.mock.calls).toEqual([[false], [true]])
  })

  it('cleans the session and stops on close code 4001', () => {
    openBoardSocket({ boardId: 1, onEvent: vi.fn() })

    first().onclose?.({ code: 4001 })
    vi.advanceTimersByTime(10_000)

    expect(clearLocalSession).toHaveBeenCalledOnce()
    expect(FakeSocket.instances).toHaveLength(1)
  })

  it('does not reconnect after being closed by the caller', () => {
    const close = openBoardSocket({ boardId: 1, onEvent: vi.fn() })

    close()
    first().onclose?.({ code: 1000 })
    vi.advanceTimersByTime(10_000)

    expect(FakeSocket.instances).toHaveLength(1)
  })
})
