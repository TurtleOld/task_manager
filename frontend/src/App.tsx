import { useEffect, useMemo, useState } from 'react'
import { Link, Route, Routes, useNavigate, useParams } from 'react-router-dom'
import { api } from './api/client'
import type { Board, Column, Card } from './api/types'

function useBoards() {
  const [boards, setBoards] = useState<Board[]>([])
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    api.listBoards().then(setBoards).finally(() => setLoading(false))
  }, [])
  return { boards, setBoards, loading }
}

function BoardsPage() {
  const { boards, setBoards, loading } = useBoards()
  const [name, setName] = useState('')
  const onCreate = async () => {
    if (!name.trim()) return
    const b = await api.createBoard(name.trim())
    setBoards((prev) => [...prev, b])
    setName('')
  }
  if (loading) return <div>Loading…</div>
  return (
    <div style={{ padding: 16 }}>
      <h1>Boards</h1>
      <div style={{ display: 'flex', gap: 8 }}>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="New board name" />
        <button onClick={onCreate}>Create</button>
      </div>
      <ul>
        {boards.map((b) => (
          <li key={b.id}><Link to={`/boards/${b.id}`}>{b.name}</Link></li>
        ))}
      </ul>
    </div>
  )
}

function BoardPage() {
  const { id } = useParams()
  const boardId = Number(id)
  const [columns, setColumns] = useState<Column[]>([])
  const [cards, setCards] = useState<Card[]>([])
  const [colName, setColName] = useState('')
  const [newCardTitle, setNewCardTitle] = useState<Record<number, string>>({})

  useEffect(() => {
    api.listColumns(boardId).then(setColumns)
    api.listCardsByBoard(boardId).then(setCards)
  }, [boardId])

  const grouped = useMemo(() => {
    const g: Record<number, Card[]> = {}
    for (const c of cards) {
      g[c.column] = g[c.column] || []
      g[c.column].push(c)
    }
    for (const k of Object.keys(g)) g[Number(k)].sort((a, b) => (a.position > b.position ? 1 : -1))
    return g
  }, [cards])

  const onCreateColumn = async () => {
    if (!colName.trim()) return
    const c = await api.createColumn(boardId, colName.trim())
    setColumns((prev) => [...prev, c])
    setColName('')
  }

  const onCreateCard = async (columnId: number) => {
    const title = (newCardTitle[columnId] || '').trim()
    if (!title) return
    const card = await api.createCard(columnId, title)
    setCards((prev) => [...prev, card])
    setNewCardTitle((s) => ({ ...s, [columnId]: '' }))
  }

  const move = async (card: Card, dir: 'up'|'down'|'left'|'right') => {
    if (dir === 'up' || dir === 'down') {
      const colCards = [...(grouped[card.column] || [])]
      const idx = colCards.findIndex((c) => c.id === card.id)
      if (idx < 0) return
      let before_id: number | undefined
      let after_id: number | undefined
      if (dir === 'up' && idx > 0) {
        after_id = colCards[idx - 1].id
      } else if (dir === 'down' && idx < colCards.length - 1) {
        before_id = colCards[idx + 1].id
      }
      const updated = await api.moveCard(card.id, { before_id, after_id })
      setCards((prev) => prev.map((c) => (c.id === updated.id ? updated : c)))
    } else {
      // left/right change column
      const order = [...columns].sort((a, b) => (a.position > b.position ? 1 : -1))
      const curIdx = order.findIndex((c) => c.id === card.column)
      const target = dir === 'left' ? order[curIdx - 1] : order[curIdx + 1]
      if (!target) return
      const updated = await api.moveCard(card.id, { to_column: target.id })
      setCards((prev) => prev.map((c) => (c.id === updated.id ? updated : c)))
    }
  }

  return (
    <div style={{ padding: 16 }}>
      <h1>Board #{boardId}</h1>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <input value={colName} onChange={(e) => setColName(e.target.value)} placeholder="New column" />
        <button onClick={onCreateColumn}>Add Column</button>
      </div>
      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
        {columns.sort((a,b)=> (a.position > b.position ? 1 : -1)).map((col) => (
          <div key={col.id} style={{ minWidth: 280 }}>
            <h3>{col.name}</h3>
            <div style={{ display: 'flex', gap: 6 }}>
              <input
                placeholder="Card title"
                value={newCardTitle[col.id] || ''}
                onChange={(e) => setNewCardTitle((s) => ({ ...s, [col.id]: e.target.value }))}
              />
              <button onClick={() => onCreateCard(col.id)}>Add</button>
            </div>
            <ul style={{ listStyle: 'none', padding: 0 }}>
              {(grouped[col.id] || []).map((card) => (
                <li key={card.id} style={{ border: '1px solid #ccc', padding: 8, marginTop: 8 }}>
                  <div><b>{card.title}</b></div>
                  <div style={{ display: 'flex', gap: 4, marginTop: 6 }}>
                    <button onClick={() => move(card, 'up')}>↑</button>
                    <button onClick={() => move(card, 'down')}>↓</button>
                    <button onClick={() => move(card, 'left')}>←</button>
                    <button onClick={() => move(card, 'right')}>→</button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<BoardsPage />} />
      <Route path="/boards/:id" element={<BoardPage />} />
    </Routes>
  )
}

