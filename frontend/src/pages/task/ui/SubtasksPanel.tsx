import { Link } from 'react-router-dom'
import { Check } from 'lucide-react'
import { Checkbox as RadixCheckbox } from '@radix-ui/react-checkbox'
import clsx from 'clsx'
import type { Card } from '../../../api/types'
import { AddRow, SectionHeading } from './section'
import { priorityRing } from '../lib/taskFormat'

interface SubtasksPanelProps {
  listId: number
  subtasks: Card[]
  autoFocus?: boolean
  onAdd: (title: string) => void
  addBusy: boolean
  onToggleComplete: (id: number, complete: boolean) => void
}

export function SubtasksPanel({ listId, subtasks, autoFocus = false, onAdd, addBusy, onToggleComplete }: SubtasksPanelProps) {
  const doneCount = subtasks.filter((item) => Boolean(item.completed_at)).length

  return (
    <section aria-label="Подзадачи">
      <SectionHeading count={subtasks.length > 0 ? `${doneCount} из ${subtasks.length}` : null}>Подзадачи</SectionHeading>
      <ul>
        {subtasks.map((subtask) => {
          const completed = Boolean(subtask.completed_at)
          const assignee = subtask.assignee_detail ? subtask.assignee_detail.full_name || subtask.assignee_detail.username : null
          return (
            <li key={subtask.id} className="-mx-2 flex min-h-10 items-center gap-3 rounded-control px-2 transition-colors hover:bg-surface-hover">
              <RadixCheckbox
                checked={completed}
                onCheckedChange={(next) => onToggleComplete(subtask.id, next === true)}
                aria-label={completed ? `Снять отметку с подзадачи «${subtask.title}»` : `Отметить подзадачу «${subtask.title}» выполненной`}
                className={clsx(
                  'flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border-[1.75px] text-text-inverse transition',
                  priorityRing(subtask.priority),
                  'data-[state=checked]:border-primary data-[state=checked]:bg-primary',
                )}
              >
                <Check className="h-3 w-3" strokeWidth={3} aria-hidden="true" />
              </RadixCheckbox>
              <Link
                to={`/lists/${listId}/tasks/${subtask.id}`}
                className={clsx(
                  'min-w-0 flex-1 truncate py-2 text-body hover:text-primary',
                  completed ? 'text-text-muted line-through decoration-text-muted/60' : 'text-text',
                )}
              >
                {subtask.title}
              </Link>
              {assignee ? <span className="shrink-0 text-body-sm text-text-muted">{assignee}</span> : null}
            </li>
          )
        })}
      </ul>
      <AddRow label="Название подзадачи" placeholder="Добавить подзадачу" autoFocus={autoFocus} busy={addBusy} onSubmit={onAdd} />
    </section>
  )
}
