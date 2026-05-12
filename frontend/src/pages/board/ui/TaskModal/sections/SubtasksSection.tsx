import { Badge, Button, Card as SurfaceCard, Chip, EmptyState, TextInput } from '@/components/ui'
import type { SubtasksSectionProps } from '../TaskModal.types'

export function SubtasksSection({
  selectedSubtasks,
  newSubtaskTitle,
  setNewSubtaskTitle,
  subtaskBusy,
  addSubtask,
  profileTimeZone,
}: SubtasksSectionProps) {
  const doneCount = selectedSubtasks.filter((item) => item.is_done).length

  return (
    <SurfaceCard as="section" className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Badge variant="info">Subtasks</Badge>
            <Badge variant="neutral">{doneCount}/{selectedSubtasks.length} выполнено</Badge>
          </div>
          <h3 className="mt-3 text-h3 text-text">Подзадачи</h3>
        </div>
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
          <TextInput value={newSubtaskTitle} onChange={(event) => setNewSubtaskTitle(event.target.value)} placeholder="Например: купить билеты завтра" className="sm:w-72" />
          <Button type="button" onClick={() => void addSubtask()} loading={subtaskBusy} size="sm">Добавить</Button>
        </div>
      </div>
      <div className="space-y-2 text-body-sm text-text-muted">
        {selectedSubtasks.length === 0 ? (
          <EmptyState title="Пока нет подзадач" className="p-4">Добавьте полноценную задачу с собственным сроком и приоритетом.</EmptyState>
        ) : (
          selectedSubtasks.map((item) => (
            <div key={item.id} className="rounded-panel border border-border/70 bg-background-subtle/45 px-3 py-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="font-semibold text-text">{item.title}</div>
                  {item.description ? <div className="mt-1 line-clamp-2 text-caption">{item.description}</div> : null}
                </div>
                <Chip tone={item.is_done ? 'success' : 'neutral'}>{item.is_done ? 'Готово' : 'В работе'}</Chip>
              </div>
              {item.deadline ? <div className="mt-2 text-caption">Срок: {formatDateTime(item.deadline, profileTimeZone)}</div> : null}
            </div>
          ))
        )}
      </div>
    </SurfaceCard>
  )
}

function formatDateTime(value: string, timeZone: string) {
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value
  return parsed.toLocaleString('ru-RU', {
    timeZone,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}
