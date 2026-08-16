import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Check } from 'lucide-react'
import { Checkbox as RadixCheckbox } from '@radix-ui/react-checkbox'
import { Badge, Button, Card as SurfaceCard, EmptyState, TextInput } from '@/components/ui'
import type { Card } from '../../../api/types'
import { cn } from '@/lib/utils'

interface SubtasksPanelProps {
  listId: number
  subtasks: Card[]
  onAdd: (title: string) => void
  addBusy: boolean
  onToggleComplete: (id: number, complete: boolean) => void
}

export function SubtasksPanel({ listId, subtasks, onAdd, addBusy, onToggleComplete }: SubtasksPanelProps) {
  const [title, setTitle] = useState('')
  const doneCount = subtasks.filter((item) => Boolean(item.completed_at)).length

  const submit = () => {
    const value = title.trim()
    if (!value) return
    onAdd(value)
    setTitle('')
  }

  return (
    <SurfaceCard as="section" className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <Badge variant="info">Подзадачи</Badge>
          <Badge variant="neutral">{doneCount}/{subtasks.length}</Badge>
        </div>
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
          <TextInput
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                submit()
              }
            }}
            placeholder="Например: купить билеты"
            className="sm:w-64"
            aria-label="Название подзадачи"
          />
          <Button type="button" onClick={submit} loading={addBusy} size="sm">Добавить</Button>
        </div>
      </div>

      {subtasks.length === 0 ? (
        <EmptyState title="Пока нет подзадач" className="p-4">
          Подзадача — это полноценная задача со своим сроком и исполнителем.
        </EmptyState>
      ) : (
        <ul className="space-y-2">
          {subtasks.map((subtask) => {
            const completed = Boolean(subtask.completed_at)
            return (
              <li
                key={subtask.id}
                className={cn(
                  'flex items-center gap-3 rounded-panel border border-border/70 bg-background-subtle/45 px-3 py-2.5',
                  completed && 'bg-surface-hover/50',
                )}
              >
                <RadixCheckbox
                  checked={completed}
                  onCheckedChange={(next) => onToggleComplete(subtask.id, next === true)}
                  aria-label={completed ? `Снять отметку с подзадачи «${subtask.title}»` : `Отметить подзадачу «${subtask.title}» выполненной`}
                  className={cn(
                    'flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 border-border-strong bg-surface text-text-inverse transition',
                    'data-[state=checked]:border-primary data-[state=checked]:bg-primary data-[state=checked]:text-text-inverse',
                  )}
                >
                  <Check className="h-3 w-3" aria-hidden="true" />
                </RadixCheckbox>
                <Link
                  to={`/lists/${listId}/tasks/${subtask.id}`}
                  className={cn(
                    'min-w-0 flex-1 truncate text-body-sm text-text hover:text-primary',
                    completed && 'text-text-muted line-through decoration-text-muted/60',
                  )}
                >
                  {subtask.title}
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </SurfaceCard>
  )
}
