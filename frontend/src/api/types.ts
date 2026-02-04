// Generated via openapi-typescript normally; minimal hand-written fallback
export interface Board {
  id: number
  name: string
  created_at: string
  updated_at: string
  version: number
}

export interface Column {
  id: number
  board: number
  name: string
  position: string
  created_at: string
  updated_at: string
  version: number
}

export interface Card {
  id: number
  board: number
  column: number
  title: string
  description: string
  position: string
  created_at: string
  updated_at: string
  version: number
}

