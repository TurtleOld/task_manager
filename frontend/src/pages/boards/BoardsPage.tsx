import { useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../../api/client'
import type { AuthUser } from '../../api/types'
import { Badge, Button, Card as SurfaceCard, PageShell, TextInput } from '../../shared/ui'
import { useBoards } from '../../shared/hooks/useBoards'

interface BoardsPageProps {
  user: AuthUser
  onLogout: () => void
}

export function BoardsPage({ user, onLogout }: BoardsPageProps) {
  const { boards, setBoards, loading } = useBoards()
  const [name, setName] = useState('')

  const onCreate = async () => {
    if (!name.trim()) return
    const board = await api.createBoard(name.trim())
    setBoards((prev) => [...prev, board])
    setName('')
  }

  if (loading) return <div className="p-6 text-text-muted">Loading...</div>

  return (
    <PageShell width="xl">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          <p className="text-label uppercase text-primary">Task Manager</p>
          <h1 className="text-h1 text-text">Доски</h1>
          <p className="text-body-sm text-text-muted">Создавайте доски и управляйте задачами в одном месте.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="success">
            <span className="h-2 w-2 rounded-full bg-success" aria-hidden="true" />
            API online
          </Badge>
          <Link
            to="/settings"
            className="inline-flex min-h-8 items-center gap-2 rounded-full border border-border bg-surface px-3 py-1 text-caption text-text-muted transition-colors duration-fast ease-standard hover:border-border-strong hover:text-text"
          >
            {user.full_name || user.username}
          </Link>
          <Button onClick={onLogout} variant="danger" size="sm" shape="pill">
            Выйти
          </Button>
        </div>
      </header>

      <SurfaceCard as="section">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <label className="flex-1">
            <span className="sr-only">Название новой доски</span>
            <TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="Название новой доски" />
          </label>
          <Button onClick={onCreate} aria-label="Создать доску">
            Создать
          </Button>
        </div>
      </SurfaceCard>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {boards.map((board) => (
          <Link
            key={board.id}
            to={`/boards/${board.id}`}
            className="group rounded-panel border border-border bg-surface p-5 shadow-surface transition duration-fast ease-standard hover:-translate-y-0.5 hover:border-primary/60 hover:shadow-elevated"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-h3 text-text group-hover:text-primary">{board.name}</h2>
                <p className="mt-2 text-body-sm text-text-muted">Перейти к задачам и статусам.</p>
              </div>
              <Badge>#{board.id}</Badge>
            </div>
          </Link>
        ))}
      </section>
    </PageShell>
  )
}
