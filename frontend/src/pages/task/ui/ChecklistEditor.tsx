import { useEffect, useId, useState } from 'react'
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors } from '@dnd-kit/core'
import type { DragEndEvent } from '@dnd-kit/core'
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { arrayMove } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Checkbox as RadixCheckbox } from '@radix-ui/react-checkbox'
import clsx from 'clsx'
import { Check, GripVertical, X } from 'lucide-react'
import type { ChecklistItem } from '../../../api/types'
import { AddRow, SectionHeading } from './section'

interface ChecklistEditorProps {
  items: ChecklistItem[]
  autoFocus?: boolean
  onAdd: (text: string) => void
  onToggle: (id: number, done: boolean) => void
  onDelete: (id: number) => void
  onReorder: (orderedIds: number[]) => void
}

export function ChecklistEditor({ items, autoFocus = false, onAdd, onToggle, onDelete, onReorder }: ChecklistEditorProps) {
  const [order, setOrder] = useState<ChecklistItem[]>(items)

  useEffect(() => {
    setOrder(items)
  }, [items])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const fromIndex = order.findIndex((item) => item.id === active.id)
    const toIndex = order.findIndex((item) => item.id === over.id)
    if (fromIndex === -1 || toIndex === -1) return
    const next = arrayMove(order, fromIndex, toIndex)
    setOrder(next)
    onReorder(next.map((item) => item.id))
  }

  const doneCount = order.filter((item) => item.done).length
  const percent = order.length > 0 ? (doneCount / order.length) * 100 : 0

  return (
    <section aria-label="Чек-лист">
      <SectionHeading count={order.length > 0 ? `${doneCount} из ${order.length}` : null}>Чек-лист</SectionHeading>
      {order.length > 0 ? (
        <div className="mb-2 h-[3px] overflow-hidden rounded-full bg-border/70" aria-hidden="true">
          <div className="h-full rounded-full bg-primary transition-[width] duration-slow ease-entrance" style={{ width: `${percent}%` }} />
        </div>
      ) : null}
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={order.map((item) => item.id)} strategy={verticalListSortingStrategy}>
          <ul>
            {order.map((item) => (
              <ChecklistRow key={item.id} item={item} onToggle={onToggle} onDelete={onDelete} />
            ))}
          </ul>
        </SortableContext>
      </DndContext>
      <AddRow label="Новый пункт чек-листа" placeholder="Добавить пункт" autoFocus={autoFocus} onSubmit={onAdd} />
    </section>
  )
}

function ChecklistRow({
  item,
  onToggle,
  onDelete,
}: {
  item: ChecklistItem
  onToggle: (id: number, done: boolean) => void
  onDelete: (id: number) => void
}) {
  const checkboxId = useId()
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id })

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={clsx(
        'group relative -mx-2 flex min-h-10 items-center gap-3 rounded-control px-2 transition-colors hover:bg-surface-hover',
        isDragging && 'z-10 bg-surface-elevated shadow-elevated',
      )}
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        aria-label="Изменить порядок пункта"
        className="absolute -left-5 cursor-grab touch-none rounded-sm p-0.5 text-text-muted opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100 active:cursor-grabbing"
      >
        <GripVertical className="h-4 w-4" aria-hidden="true" />
      </button>
      <RadixCheckbox
        id={checkboxId}
        checked={item.done}
        onCheckedChange={(next) => onToggle(item.id, next === true)}
        className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[5px] border-[1.75px] border-border-strong text-text-inverse transition data-[state=checked]:border-primary data-[state=checked]:bg-primary"
      >
        <Check className="h-3 w-3" strokeWidth={3} aria-hidden="true" />
      </RadixCheckbox>
      <label
        htmlFor={checkboxId}
        className={clsx(
          'min-w-0 flex-1 cursor-pointer py-2 text-body',
          item.done ? 'text-text-muted line-through decoration-text-muted/60' : 'text-text',
        )}
      >
        {item.text}
      </label>
      <button
        type="button"
        onClick={() => onDelete(item.id)}
        aria-label={`Удалить пункт «${item.text}»`}
        className="rounded-sm p-1 text-text-muted opacity-0 transition-opacity hover:text-danger focus-visible:opacity-100 group-hover:opacity-100"
      >
        <X className="h-4 w-4" aria-hidden="true" />
      </button>
    </li>
  )
}
