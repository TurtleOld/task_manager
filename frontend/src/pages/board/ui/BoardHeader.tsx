import { Link } from 'react-router-dom'
import { Button } from '../../../shared/ui'

interface BoardHeaderProps {
  boardName: string
  onCreateColumn: () => void
  onLogout: () => void
  onToggleTheme: () => void
}

export function BoardHeader({ boardName, onCreateColumn, onLogout, onToggleTheme }: BoardHeaderProps) {
  return (
    <header className="sticky top-0 z-sticky border-b border-border bg-surface/90 px-4 py-5 shadow-surface backdrop-blur">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <nav className="flex items-center gap-2 text-body-sm text-text-muted" aria-label="Навигация по доскам">
            <Link to="/" className="hover:text-primary">Все доски</Link>
            <span aria-hidden="true">/</span>
            <span>{boardName}</span>
          </nav>
          <h1 className="mt-2 text-h1 text-text">{boardName || 'Доска'}</h1>
          <p className="text-body-sm text-text-muted">Перетаскивайте задачи, фильтруйте поток и открывайте детали без потери контекста.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={onCreateColumn} variant="secondary" aria-label="Создать колонку">
            <span aria-hidden="true">+</span>
            Новая колонка
          </Button>
          <Button onClick={onLogout} variant="danger" aria-label="Выйти">
            Выйти
          </Button>
          <Button type="button" variant="secondary" onClick={onToggleTheme} aria-label="Переключить тему">
            Тема
          </Button>
        </div>
      </div>
    </header>
  )
}
