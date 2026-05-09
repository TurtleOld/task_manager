import { useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../../api/client'
import type { AuthUser } from '../../api/types'
import { Badge, Button, Card as SurfaceCard, EmptyState, PageShell, TextInput } from '../../shared/ui'
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
    <PageShell width="2xl" spacing="md">
      <header className="rounded-[1.6rem] border border-border/80 bg-[image:var(--gradient-surface)] px-6 py-6 shadow-elevated backdrop-blur">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="primary">Task Manager</Badge>
            </div>
            <div>
              <h1 className="text-h1 text-text">Доски</h1>
              <p className="mt-2 max-w-3xl text-body-sm text-text-muted">Создавайте рабочие пространства, группируйте задачи по потокам и переходите к управлению в один клик.</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="success">
              <span className="h-2 w-2 rounded-full bg-success" aria-hidden="true" />
              API online
            </Badge>
            <Link to="/settings" className="inline-flex min-h-10 items-center gap-2 rounded-full border border-border bg-surface/90 px-4 py-2 text-caption text-text-muted shadow-surface backdrop-blur transition duration-fast ease-standard hover:border-border-strong hover:text-text">
              {user.full_name || user.username}
            </Link>
            <Button onClick={onLogout} variant="danger" size="sm" shape="pill">Выйти</Button>
          </div>
        </div>
      </header>

      <section className="grid gap-4 md:grid-cols-[1.3fr_0.7fr]">
        <SurfaceCard as="section" className="space-y-4 border-primary/10">
          <div>
            <div className="flex items-center gap-2">
              <Badge variant="primary">Create board</Badge>
              <Badge variant="neutral">Fast start</Badge>
            </div>
            <h2 className="mt-3 text-h3 text-text">Создать новую доску</h2>
            <p className="mt-1 text-body-sm text-text-muted">Новая доска появится в списке сразу после создания.</p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <label className="flex-1">
              <span className="sr-only">Название новой доски</span>
              <TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="Например: Product roadmap, Marketing sprint, Team backlog" />
            </label>
            <Button onClick={onCreate} aria-label="Создать доску">Создать</Button>
          </div>
        </SurfaceCard>

        <SurfaceCard as="section" className="space-y-3">
          <p className="text-caption uppercase text-text-muted">Быстрый обзор</p>
          <div className="rounded-[1.15rem] border border-border/70 bg-background-subtle/55 p-4">
            <p className="text-body font-semibold text-text">{boards.length} активных досок</p>
            <p className="mt-1 text-body-sm text-text-muted">Используйте отдельные доски для команд, продуктов или спринтов.</p>
          </div>
          <div className="rounded-[1.15rem] border border-border/70 bg-background-subtle/55 p-4">
            <p className="text-body font-semibold text-text">Единый доступ к настройкам</p>
            <p className="mt-1 text-body-sm text-text-muted">Профиль, уведомления и доступы доступны из settings workspace.</p>
          </div>
        </SurfaceCard>
      </section>

      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-h3 text-text">Список досок</h2>
            <p className="mt-1 text-body-sm text-text-muted">Выберите рабочее пространство для перехода к задачам.</p>
          </div>
          <Badge variant="neutral">{boards.length} items</Badge>
        </div>
        {boards.length === 0 ? (
          <EmptyState title="Пока нет ни одной доски">Создайте первую доску, чтобы начать работу с задачами и колонками.</EmptyState>
        ) : (
          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {boards.map((board) => (
              <Link key={board.id} to={`/boards/${board.id}`} className="group rounded-[1.35rem] border border-border/80 bg-[image:var(--gradient-surface)] p-5 shadow-surface backdrop-blur transition duration-fast ease-standard hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-elevated">
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <Badge variant="primary">Board</Badge>
                      <Badge>#{board.id}</Badge>
                    </div>
                    <div>
                      <h3 className="text-h3 text-text group-hover:text-primary">{board.name}</h3>
                      <p className="mt-2 text-body-sm text-text-muted">Перейти к задачам, статусам и realtime-обновлениям.</p>
                    </div>
                  </div>
                  <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-xl text-primary shadow-surface" aria-hidden="true">→</span>
                </div>
              </Link>
            ))}
          </section>
        )}
      </section>
    </PageShell>
  )
}
