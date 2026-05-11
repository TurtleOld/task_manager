import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Archive, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { useArchiveBoard, useDeleteBoard } from '../../../api/queries/boards'
import { Badge, Button } from '@/components/ui'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'

interface BoardHeaderProps {
  boardId: number
  boardName: string
  onCreateColumn: () => void
}

export function BoardHeader({ boardId, boardName, onCreateColumn }: BoardHeaderProps) {
  const navigate = useNavigate()
  const archiveMutation = useArchiveBoard()
  const deleteMutation = useDeleteBoard()
  const [confirmDialog, setConfirmDialog] = useState<'archive' | 'delete' | null>(null)

  const onArchive = async () => {
    await archiveMutation.mutateAsync(boardId)
    toast.success(`Доска «${boardName}» архивирована`)
    navigate('/')
  }

  const onDelete = async () => {
    await deleteMutation.mutateAsync(boardId)
    toast.success(`Доска «${boardName}» удалена`)
    navigate('/')
  }

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
          <Button
            variant="secondary"
            onClick={() => setConfirmDialog('archive')}
            aria-label="Архивировать доску"
          >
            <Archive className="h-4 w-4" />
            Архивировать
          </Button>
          <Button
            variant="danger"
            onClick={() => setConfirmDialog('delete')}
            aria-label="Удалить доску"
          >
            <Trash2 className="h-4 w-4" />
            Удалить
          </Button>
        </div>
      </div>

      <Dialog open={confirmDialog === 'archive'} onOpenChange={(open) => !open && setConfirmDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Архивировать доску?</DialogTitle>
            <DialogDescription>
              Доска «{boardName}» будет скрыта из списка. Все карточки сохранятся. Вы сможете восстановить доску из раздела Архив.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setConfirmDialog(null)}>Отмена</Button>
            <Button
              variant="secondary"
              loading={archiveMutation.isPending}
              onClick={() => void onArchive()}
            >
              <Archive className="h-4 w-4" />
              Архивировать
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmDialog === 'delete'} onOpenChange={(open) => !open && setConfirmDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Удалить доску?</DialogTitle>
            <DialogDescription>
              Доска «{boardName}» и все её колонки и карточки будут удалены безвозвратно. Это действие нельзя отменить.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setConfirmDialog(null)}>Отмена</Button>
            <Button
              variant="danger"
              loading={deleteMutation.isPending}
              onClick={() => void onDelete()}
            >
              <Trash2 className="h-4 w-4" />
              Удалить навсегда
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </header>
  )
}
