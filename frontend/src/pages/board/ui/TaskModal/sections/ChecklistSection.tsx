import { Badge, Button, Card as SurfaceCard, Checkbox, EmptyState, TextInput } from '../../../../../shared/ui'
import type { ChecklistSectionProps } from '../TaskModal.types'

export function ChecklistSection({
  selectedChecklist,
  newChecklistItem,
  setNewChecklistItem,
  addChecklistItem,
  toggleChecklistItem,
  removeChecklistItem,
}: ChecklistSectionProps) {
  return (
    <SurfaceCard as="section" className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Badge variant="success">Checklist</Badge>
            <Badge variant="neutral">{selectedChecklist.length} пунктов</Badge>
          </div>
          <h3 className="mt-3 text-h3 text-text">Чек-лист</h3>
        </div>
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
          <TextInput value={newChecklistItem} onChange={(event) => setNewChecklistItem(event.target.value)} placeholder="Добавить пункт" className="sm:w-56" />
          <Button type="button" onClick={addChecklistItem} size="sm">Добавить</Button>
        </div>
      </div>
      <div className="space-y-2 text-body-sm text-text-muted">
        {selectedChecklist.length === 0 ? (
          <EmptyState title="Пока нет пунктов" className="p-4">Добавьте первый пункт, чтобы отслеживать прогресс задачи.</EmptyState>
        ) : (
          selectedChecklist.map((item) => (
            <div key={item.id} className="flex items-center justify-between gap-3 rounded-panel border border-border/70 bg-background-subtle/45 px-3 py-3">
              <Checkbox
                label={<span className={item.done ? 'line-through opacity-70' : ''}>{item.text}</span>}
                checked={item.done}
                onChange={() => toggleChecklistItem(item.id)}
                className="flex-1 border-transparent bg-transparent px-0 py-0 shadow-none"
              />
              <Button type="button" variant="danger" size="sm" onClick={() => removeChecklistItem(item.id)}>Удалить</Button>
            </div>
          ))
        )}
      </div>
    </SurfaceCard>
  )
}
