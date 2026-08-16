import { useEffect, useState } from 'react'
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors } from '@dnd-kit/core'
import type { DragEndEvent } from '@dnd-kit/core'
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { arrayMove } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical, X } from 'lucide-react'
import { Badge, Button, Card as SurfaceCard, Checkbox, EmptyState, TextInput } from '@/components/ui'
import type { ChecklistItem } from '../../../api/types'
import { cn } from '@/lib/utils'

interface ChecklistEditorProps {
  items: ChecklistItem[]
  onAdd: (text: string) => void
  onToggle: (id: number, done: boolean) => void
  onDelete: (id: number) => void
  onReorder: (orderedIds: number[]) => void
}

export function ChecklistEditor({ items, onAdd, onToggle, onDelete, onReorder }: ChecklistEditorProps) {
  const [newText, setNewText] = useState('')
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

  const submitNew = () => {
    const text = newText.trim()
    if (!text) return
    onAdd(text)
    setNewText('')
  }

  const doneCount = order.filter((item) => item.done).length

  return (
    <SurfaceCard as="section" className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Badge variant="success">Чек-лист</Badge>
            <Badge variant="neutral">{doneCount}/{order.length}</Badge>
          </div>
        </div>
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
          <TextInput
            value={newText}
            onChange={(event) => setNewText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                submitNew()
              }
            }}
            placeholder="Добавить пункт"
            className="sm:w-56"
            aria-label="Новый пункт чек-листа"
          />
          <Button type="button" onClick={submitNew} size="sm">Добавить</Button>
        </div>
      </div>

      {order.length === 0 ? (
        <EmptyState title="Пока нет пунктов" className="p-4">
          Например: товары для покупки или шаги подготовки.
        </EmptyState>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={order.map((item) => item.id)} strategy={verticalListSortingStrategy}>
            <ul className="space-y-2">
              {order.map((item) => (
                <ChecklistRow key={item.id} item={item} onToggle={onToggle} onDelete={onDelete} />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      )}
    </SurfaceCard>
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
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id })

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        'flex items-center gap-2 rounded-panel border border-border/70 bg-background-subtle/45 px-2 py-2',
        isDragging && 'opacity-60',
      )}
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        aria-label="Изменить порядок пункта"
        className="cursor-grab touch-none rounded-sm p-1 text-text-muted hover:text-text active:cursor-grabbing"
      >
        <GripVertical className="h-4 w-4" aria-hidden="true" />
      </button>
      <Checkbox
        label={<span className={item.done ? 'line-through opacity-70' : ''}>{item.text}</span>}
        checked={item.done}
        onChange={() => onToggle(item.id, !item.done)}
        className="flex-1 border-transparent bg-transparent px-0 py-0 shadow-none"
      />
      <button
        type="button"
        onClick={() => onDelete(item.id)}
        aria-label={`Удалить пункт «${item.text}»`}
        className="rounded-sm p-1 text-text-muted hover:text-danger"
      >
        <X className="h-4 w-4" aria-hidden="true" />
      </button>
    </li>
  )
}
