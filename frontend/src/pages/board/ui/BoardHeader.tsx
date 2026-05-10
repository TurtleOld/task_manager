import { Link } from 'react-router-dom'
import { Badge, Button } from '@/components/ui'

interface BoardHeaderProps {
  boardName: string
  onCreateColumn: () => void
}

export function BoardHeader({ boardName, onCreateColumn }: BoardHeaderProps) {
  return (
    <header className="border-b border-border/80 bg-background/72 px-4 py-5 backdrop-blur-xl">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-3">
          <nav className="flex items-center gap-2 text-body-sm text-text-muted" aria-label="Навигация по доскам">
            <Link to="/" className="font-medium hover:text-primary">Все доски</Link>
            <span aria-hidden="true">/</span>
            <span className="text-text">{boardName}</span>
          </nav>
          <div>
            <div className="flex items-center gap-2">
              <Badge variant="info">Workspace</Badge>
              <Badge variant="neutral">Realtime board</Badge>
            </div>
            <h1 className="mt-3 text-h1 text-text">{boardName || 'Доска'}</h1>
            <p className="max-w-2xl text-body-sm text-text-muted">Перетаскивайте задачи, фильтруйте поток и открывайте детали без потери контекста.</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={onCreateColumn} variant="secondary" aria-label="Создать колонку">
            <span aria-hidden="true">+</span>
            Новая колонка
          </Button>
        </div>
      </div>
    </header>
  )
}
