import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useBoards, useCreateBoard } from '../../api/queries/boards'
import { Badge, Button, Card as SurfaceCard, EmptyState, PageShell, Skeleton, TextInput } from '@/components/ui'

export function BoardsPage() {
  const { data: boards = [], isLoading } = useBoards()
  const createBoardMutation = useCreateBoard()
  const [name, setName] = useState('')

  const onCreate = async () => {
    if (!name.trim()) return
    await createBoardMutation.mutateAsync(name.trim())
    setName('')
  }

  if (isLoading) return <BoardsPageSkeleton />

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
          <Badge variant="success">
            <span className="h-2 w-2 rounded-full bg-success" aria-hidden="true" />
            API online
          </Badge>
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

function BoardsPageSkeleton() {
  return (
    <PageShell width="2xl" spacing="md" aria-busy="true" aria-label="Загрузка досок">
      <header className="rounded-[1.6rem] border border-border/80 bg-[image:var(--gradient-surface)] px-6 py-6 shadow-elevated backdrop-blur">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-4">
            <div className="flex gap-2">
              <Skeleton className="h-6 w-28 rounded-full" />
              <Skeleton className="h-6 w-20 rounded-full" />
            </div>
            <div className="space-y-3">
              <Skeleton className="h-10 w-44" />
              <Skeleton className="h-4 w-full max-w-2xl" />
              <Skeleton className="h-4 w-2/3 max-w-xl" />
            </div>
          </div>
          <Skeleton className="h-6 w-28 rounded-full" />
        </div>
      </header>

      <section className="grid gap-4 md:grid-cols-[1.3fr_0.7fr]">
        <SurfaceCard as="section" className="space-y-4 border-primary/10">
          <div className="space-y-3">
            <div className="flex gap-2">
              <Skeleton className="h-6 w-28 rounded-full" />
              <Skeleton className="h-6 w-24 rounded-full" />
            </div>
            <Skeleton className="h-7 w-56" />
            <Skeleton className="h-4 w-72 max-w-full" />
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <Skeleton className="h-11 flex-1 rounded-control" />
            <Skeleton className="h-11 w-28 rounded-control" />
          </div>
        </SurfaceCard>

        <SurfaceCard as="section" className="space-y-3">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-24 rounded-[1.15rem]" />
          <Skeleton className="h-24 rounded-[1.15rem]" />
        </SurfaceCard>
      </section>

      <section className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div className="space-y-2">
            <Skeleton className="h-7 w-36" />
            <Skeleton className="h-4 w-80 max-w-full" />
          </div>
          <Skeleton className="h-6 w-20 rounded-full" />
        </div>
        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="rounded-[1.35rem] border border-border/80 bg-[image:var(--gradient-surface)] p-5 shadow-surface backdrop-blur">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 space-y-4">
                  <div className="flex gap-2">
                    <Skeleton className="h-6 w-16 rounded-full" />
                    <Skeleton className="h-6 w-12 rounded-full" />
                  </div>
                  <div className="space-y-2">
                    <Skeleton className="h-7 w-3/4" />
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-5/6" />
                  </div>
                </div>
                <Skeleton className="h-11 w-11 rounded-2xl" />
              </div>
            </div>
          ))}
        </section>
      </section>
    </PageShell>
  )
}
