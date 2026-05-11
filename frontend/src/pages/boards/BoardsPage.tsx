import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useBoardTemplates, useBoards, useCreateBoard, useCreateBoardFromTemplate } from '../../api/queries/boards'
import { Badge, Button, Card as SurfaceCard, EmptyState, Field, PageShell, Skeleton, TextInput } from '@/components/ui'

const BOARD_ICONS = ['📋', '🏡', '🛒', '🛠️', '🏖️', '💰', '🎯', '📚', '🚗', '🐾', '🌱', '🎁']
const BOARD_COLORS = ['#2563eb', '#16a34a', '#d97706', '#dc2626', '#7c3aed', '#0891b2', '#db2777', '#4f46e5']

export function BoardsPage() {
  const { data: boards = [], isLoading } = useBoards()
  const { data: templates = [], isLoading: templatesLoading } = useBoardTemplates()
  const createBoardMutation = useCreateBoard()
  const createFromTemplateMutation = useCreateBoardFromTemplate()
  const [name, setName] = useState('')
  const [icon, setIcon] = useState(BOARD_ICONS[0] ?? '📋')
  const [color, setColor] = useState(BOARD_COLORS[0] ?? '#2563eb')
  const [templateName, setTemplateName] = useState('')

  const onCreate = async () => {
    if (!name.trim()) return
    await createBoardMutation.mutateAsync({ name: name.trim(), icon, color })
    setName('')
  }

  const onCreateFromTemplate = async (templateId: string) => {
    await createFromTemplateMutation.mutateAsync({
      template_id: templateId,
      name: templateName.trim() || undefined,
    })
    setTemplateName('')
  }

  if (isLoading) return <BoardsPageSkeleton />

  return (
    <PageShell width="2xl" spacing="md">
      <header className="rounded-[1.6rem] border border-border/80 bg-[image:var(--gradient-surface)] px-6 py-6 shadow-elevated backdrop-blur">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="primary">Task Manager</Badge>
              <Badge variant="success">Boards</Badge>
            </div>
            <div>
              <h1 className="text-h1 text-text">Доски</h1>
              <p className="mt-2 max-w-3xl text-body-sm text-text-muted">Создавайте рабочие пространства, выбирайте визуальные маркеры и стартуйте быстрее с семейными шаблонами.</p>
            </div>
          </div>
          <Badge variant="success">
            <span className="h-2 w-2 rounded-full bg-success" aria-hidden="true" />
            API online
          </Badge>
        </div>
      </header>

      <section className="grid gap-4 xl:grid-cols-[1fr_1fr]">
        <SurfaceCard as="section" className="space-y-4 border-primary/10">
          <div>
            <div className="flex items-center gap-2">
              <Badge variant="primary">Create board</Badge>
              <Badge variant="neutral">T-506</Badge>
            </div>
            <h2 className="mt-3 text-h3 text-text">Создать пустую доску</h2>
            <p className="mt-1 text-body-sm text-text-muted">Выберите иконку и цвет, чтобы доска легко отличалась в sidebar и списке.</p>
          </div>
          <Field label="Название" htmlFor="new-board-name">
            <TextInput id="new-board-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Например: Семья, Ремонт, Отпуск" />
          </Field>
          <div className="space-y-2">
            <p className="text-label uppercase tracking-[0.08em] text-text-muted">Иконка</p>
            <div className="flex flex-wrap gap-2">
              {BOARD_ICONS.map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => setIcon(item)}
                  className={`flex h-11 w-11 items-center justify-center rounded-control border text-xl transition ${icon === item ? 'border-primary bg-primary/10 ring-2 ring-primary/20' : 'border-border bg-surface hover:border-primary/30'}`}
                  aria-label={`Выбрать иконку ${item}`}
                >
                  {item}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <p className="text-label uppercase tracking-[0.08em] text-text-muted">Цвет</p>
            <div className="flex flex-wrap gap-2">
              {BOARD_COLORS.map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => setColor(item)}
                  className={`h-9 w-9 rounded-full border border-border transition ${color === item ? 'ring-2 ring-primary ring-offset-2 ring-offset-background' : 'hover:scale-105'}`}
                  style={{ backgroundColor: item }}
                  aria-label={`Выбрать цвет ${item}`}
                />
              ))}
            </div>
          </div>
          <div className="flex items-center justify-between gap-3 rounded-[1.15rem] border border-border/70 bg-background-subtle/55 p-4">
            <div className="flex min-w-0 items-center gap-3">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-xl text-white shadow-surface" style={{ backgroundColor: color }}>{icon}</span>
              <div className="min-w-0">
                <p className="truncate text-body font-semibold text-text">{name.trim() || 'Новая доска'}</p>
                <p className="text-caption text-text-muted">Предпросмотр</p>
              </div>
            </div>
            <Button onClick={onCreate} loading={createBoardMutation.isPending} disabled={!name.trim() || createBoardMutation.isPending} aria-label="Создать доску">Создать</Button>
          </div>
        </SurfaceCard>

        <SurfaceCard as="section" className="space-y-4 border-primary/10">
          <div>
            <div className="flex items-center gap-2">
              <Badge variant="primary">Templates</Badge>
              <Badge variant="neutral">T-505</Badge>
            </div>
            <h2 className="mt-3 text-h3 text-text">Создать из шаблона</h2>
            <p className="mt-1 text-body-sm text-text-muted">Шаблон создаёт доску с колонками и стартовыми карточками.</p>
          </div>
          <Field label="Свое название (необязательно)" htmlFor="template-board-name">
            <TextInput id="template-board-name" value={templateName} onChange={(e) => setTemplateName(e.target.value)} placeholder="Оставьте пустым, чтобы взять название шаблона" />
          </Field>
          {templatesLoading ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} className="h-32 rounded-[1.15rem]" />)}
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {templates.map((template) => (
                <button
                  key={template.id}
                  type="button"
                  onClick={() => void onCreateFromTemplate(template.id)}
                  disabled={createFromTemplateMutation.isPending}
                  className="group rounded-[1.15rem] border border-border/80 bg-background-subtle/55 p-4 text-left transition hover:-translate-y-0.5 hover:border-primary/30 hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <div className="flex items-start gap-3">
                    <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-xl text-white shadow-surface" style={{ backgroundColor: template.color }}>{template.icon}</span>
                    <div className="min-w-0">
                      <p className="text-body font-semibold text-text group-hover:text-primary">{template.name}</p>
                      <p className="mt-1 text-caption text-text-muted">Колонки, labels и примеры задач</p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
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
                  <div className="min-w-0 space-y-3">
                    <div className="flex items-center gap-2">
                      <Badge variant="primary">Board</Badge>
                      <Badge>#{board.id}</Badge>
                    </div>
                    <div>
                      <h3 className="truncate text-h3 text-text group-hover:text-primary">{board.name}</h3>
                      <p className="mt-2 text-body-sm text-text-muted">Перейти к задачам, статусам и realtime-обновлениям.</p>
                    </div>
                  </div>
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-xl text-white shadow-surface" style={{ backgroundColor: board.color || '#2563eb' }} aria-hidden="true">{board.icon || '📋'}</span>
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

      <section className="grid gap-4 xl:grid-cols-2">
        <SurfaceCard as="section" className="space-y-4 border-primary/10">
          <Skeleton className="h-6 w-28 rounded-full" />
          <Skeleton className="h-7 w-56" />
          <Skeleton className="h-11 rounded-control" />
          <Skeleton className="h-24 rounded-[1.15rem]" />
          <Skeleton className="h-20 rounded-[1.15rem]" />
        </SurfaceCard>

        <SurfaceCard as="section" className="space-y-4">
          <Skeleton className="h-6 w-28 rounded-full" />
          <Skeleton className="h-7 w-56" />
          <Skeleton className="h-11 rounded-control" />
          <div className="grid gap-3 sm:grid-cols-2">
            <Skeleton className="h-32 rounded-[1.15rem]" />
            <Skeleton className="h-32 rounded-[1.15rem]" />
            <Skeleton className="h-32 rounded-[1.15rem]" />
            <Skeleton className="h-32 rounded-[1.15rem]" />
          </div>
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
                <Skeleton className="h-12 w-12 rounded-2xl" />
              </div>
            </div>
          ))}
        </section>
      </section>
    </PageShell>
  )
}
