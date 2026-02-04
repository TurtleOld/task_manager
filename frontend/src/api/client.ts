import type { Board, Column, Card } from './types'

const BASE = (import.meta as any).env?.VITE_API_BASE_URL || '/api'
const V1 = `${BASE}/v1`

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`HTTP ${res.status}: ${text}`)
  }
  return res.json() as Promise<T>
}

export const api = {
  // Boards
  listBoards: async (): Promise<Board[]> => {
    const res = await fetch(`${V1}/boards/`)
    return json(res)
  },
  createBoard: async (name: string): Promise<Board> => {
    const res = await fetch(`${V1}/boards/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    })
    return json(res)
  },

  // Columns
  listColumns: async (boardId: number): Promise<Column[]> => {
    const res = await fetch(`${V1}/columns/?board=${boardId}`)
    return json(res)
  },
  createColumn: async (board: number, name: string): Promise<Column> => {
    const res = await fetch(`${V1}/columns/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ board, name }),
    })
    return json(res)
  },

  // Cards
  listCardsByBoard: async (boardId: number): Promise<Card[]> => {
    const res = await fetch(`${V1}/cards/?board=${boardId}`)
    return json(res)
  },
  listCardsByColumn: async (columnId: number): Promise<Card[]> => {
    const res = await fetch(`${V1}/cards/?column=${columnId}`)
    return json(res)
  },
  createCard: async (column: number, title: string, description = ''): Promise<Card> => {
    const res = await fetch(`${V1}/cards/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ column, title, description }),
    })
    return json(res)
  },
  moveCard: async (
    id: number,
    payload: Partial<{ to_column: number; before_id: number; after_id: number; expected_version: number }>
  ): Promise<Card> => {
    const res = await fetch(`${V1}/cards/${id}/move/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    return json(res)
  },
}

