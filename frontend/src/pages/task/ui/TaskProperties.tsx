import { useState } from 'react'
import { Bell, Repeat, UserRound } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import type { AssignableUser } from '../../../api/queries/task'
import type { AgendaBoundaries, Board, Card } from '../../../api/types'
import { priorityToLabel } from '../../../shared/lib/priority'
import { formatDeadlineShort } from '../../agenda/lib/formatDeadline'
import { DeadlinePicker } from '../../agenda/ui/DeadlinePicker'
import { ListLabel } from '../../agenda/ui/ListLabel'
import { MenuOption, PriorityRing, PropertyButton, propertyButtonClass, propertyPopoverClass } from './property'
import { RecurrenceProperty } from './RecurrenceProperty'
import { RemindersProperty } from './RemindersProperty'

type TaskPatch = Partial<Pick<Card, 'deadline' | 'assignee' | 'priority'>>

interface TaskPropertiesProps {
  task: Card
  board?: Board
  boundaries: AgendaBoundaries
  assignableUsers: AssignableUser[]
  listId: number
  onUpdate: (patch: TaskPatch) => void
}

const PRIORITIES: Array<0 | 1 | 2 | 3> = [0, 1, 2, 3]
const PRIORITY_SHORT: Record<0 | 1 | 2 | 3, string> = {
  0: 'Без приоритета',
  1: 'Когда будет время',
  2: 'Важно',
  3: 'Срочно',
}

/** Строка свойств под названием: всё, что задаёт «когда и кто», в одну линию. */
export function TaskProperties({ task, board, boundaries, assignableUsers, listId, onUpdate }: TaskPropertiesProps) {
  const deadlineTone = deadlineToneClass(task.deadline, boundaries)

  return (
    <div className="flex flex-wrap items-center gap-1" aria-label="Свойства задачи" role="group">
      {board ? (
        <span className="mr-1 inline-flex h-8 items-center text-body-sm">
          <ListLabel board={board} />
        </span>
      ) : null}
      {board ? <span className="mx-1 hidden h-5 w-px bg-border sm:block" aria-hidden="true" /> : null}

      <DeadlinePicker
        boundaries={boundaries}
        deadline={task.deadline}
        displayText={task.deadline ? formatDeadlineShort(task.deadline, boundaries) : undefined}
        emptyText="Срок"
        onCommit={(deadline) => onUpdate({ deadline })}
        className={`${propertyButtonClass} border-0 bg-transparent ${task.deadline ? deadlineTone : 'text-text-muted/70'}`}
      />

      <AssigneeProperty
        assigneeId={task.assignee}
        assigneeName={task.assignee_detail ? task.assignee_detail.full_name || task.assignee_detail.username : null}
        users={assignableUsers}
        onChange={(assignee) => onUpdate({ assignee })}
      />

      <PriorityProperty priority={task.priority} onChange={(priority) => onUpdate({ priority })} />

      {task.deadline ? (
        <>
          <RecurrenceProperty cardId={task.id} listId={listId} />
          <RemindersProperty cardId={task.id} />
        </>
      ) : (
        <span
          className={`${propertyButtonClass} cursor-default text-text-muted/60 hover:bg-transparent`}
          title="Повтор и напоминание отсчитываются от срока: сначала задайте срок"
        >
          <Repeat aria-hidden="true" />
          <Bell aria-hidden="true" />
          <span className="text-caption font-normal">нужен срок</span>
        </span>
      )}
    </div>
  )
}

function deadlineToneClass(deadline: string | null, boundaries: AgendaBoundaries): string {
  if (!deadline) return ''
  const at = new Date(deadline).getTime()
  if (at < Date.now()) return 'text-danger'
  if (at < new Date(boundaries.tomorrow_start).getTime() && at >= new Date(boundaries.today_start).getTime()) return 'text-primary'
  return 'text-text'
}

function AssigneeProperty({
  assigneeId,
  assigneeName,
  users,
  onChange,
}: {
  assigneeId: number | null
  assigneeName: string | null
  users: AssignableUser[]
  onChange: (id: number | null) => void
}) {
  const [open, setOpen] = useState(false)
  const name = assigneeId == null ? null : users.find((user) => user.id === assigneeId)?.name ?? assigneeName ?? `#${assigneeId}`
  const select = (id: number | null) => {
    setOpen(false)
    if (id !== assigneeId) onChange(id)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <PropertyButton tone={name ? 'set' : 'empty'} aria-label={name ? `Исполнитель: ${name}` : 'Назначить исполнителя'}>
          {name ? <Initial name={name} /> : <UserRound aria-hidden="true" />}
          {name ?? 'Исполнитель'}
        </PropertyButton>
      </PopoverTrigger>
      <PopoverContent align="start" className={propertyPopoverClass}>
        <div role="menu" aria-label="Исполнитель">
          <MenuOption selected={assigneeId == null} onSelect={() => select(null)}>
            <UserRound className="h-4 w-4 text-text-muted" aria-hidden="true" />
            Не назначен
          </MenuOption>
          {users.map((user) => (
            <MenuOption key={user.id} selected={assigneeId === user.id} onSelect={() => select(user.id)}>
              <Initial name={user.name} />
              {user.name}
            </MenuOption>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}

function Initial({ name }: { name: string }) {
  return (
    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[0.65rem] font-bold text-primary" aria-hidden="true">
      {name[0]?.toUpperCase() ?? '?'}
    </span>
  )
}

function PriorityProperty({ priority, onChange }: { priority: number; onChange: (priority: 0 | 1 | 2 | 3) => void }) {
  const [open, setOpen] = useState(false)
  const current = (PRIORITIES.includes(priority as 0 | 1 | 2 | 3) ? priority : 0) as 0 | 1 | 2 | 3
  const select = (value: 0 | 1 | 2 | 3) => {
    setOpen(false)
    if (value !== current) onChange(value)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <PropertyButton tone={current === 0 ? 'empty' : 'set'} aria-label={`Приоритет: ${priorityToLabel(current)}`}>
          <PriorityRing priority={current} />
          {PRIORITY_SHORT[current]}
        </PropertyButton>
      </PopoverTrigger>
      <PopoverContent align="start" className={propertyPopoverClass}>
        <div role="menu" aria-label="Приоритет">
          {PRIORITIES.map((value) => (
            <MenuOption key={value} selected={current === value} onSelect={() => select(value)}>
              <PriorityRing priority={value} />
              {priorityToLabel(value)}
            </MenuOption>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}
