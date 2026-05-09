import { useEffect, useState } from 'react'
import { api } from '../../api/client'
import type { Board } from '../../api/types'

export function useBoards() {
  const [boards, setBoards] = useState<Board[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.listBoards().then(setBoards).finally(() => setLoading(false))
  }, [])

  return { boards, setBoards, loading }
}
