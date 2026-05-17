import { useState } from 'react'
import { Badge, Button, Card as SurfaceCard, Field, Select, TextInput } from '@/components/ui'
import type { MetaSectionProps } from '../TaskModal.types'

export function MetaSection({ draft, setDraft, assignees, selectedCardId, profileTimeZone, getTimeZoneLabel, scheduleDeadlineSave, columns, onMoveToColumn }: MetaSectionProps) {
  const [moveBusy, setMoveBusy] = useState(false)
  const [pendingColumnId, setPendingColumnId] = useState<number | null>(null)

  const handleMove = async () => {
    if (!pendingColumnId || moveBusy) return
    setMoveBusy(true)
    try {
      await onMoveToColumn(pendingColumnId)
      setPendingColumnId(null)
    } finally {
      setMoveBusy(false)
    }
  }

  return (
    <SurfaceCard as="section" className="space-y-4">
      <div>
        <div className="flex items-center gap-2">
          <Badge variant="primary">Meta</Badge>
          <Badge variant="neutral">Task controls</Badge>
        </div>
        <h3 className="mt-3 text-h3 text-text">Параметры задачи</h3>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
        <Field label="Ответственный" htmlFor="task-assignee">
          <Select
            id="task-assignee"
            value={draft.assignee ?? ''}
            onChange={(event) => {
              if (!selectedCardId) return
              const next = event.target.value ? Number(event.target.value) : null
              setDraft((prev) => (prev ? { ...prev, assignee: next } : prev))
            }}
          >
            <option value="">Не назначен</option>
            {assignees.map((assignee) => <option key={assignee.id} value={assignee.id}>{assignee.name}</option>)}
          </Select>
        </Field>
        <Field
          label="Срок выполнения"
          htmlFor="task-deadline"
          hint={`Выберите дату и время завершения задачи в часовом поясе ${getTimeZoneLabel(profileTimeZone)}.`}
          hintId="task-deadline-hint"
        >
          <TextInput
            id="task-deadline"
            lang="ru-RU"
            type="datetime-local"
            value={draft.deadline}
            onChange={(event) => {
              if (!selectedCardId) return
              setDraft((prev) => (prev ? { ...prev, deadline: event.target.value } : prev))
              scheduleDeadlineSave()
            }}
            aria-describedby="task-deadline-hint"
          />
        </Field>
        {columns.length > 1 ? (
          <Field label="Переместить в колонку" htmlFor="task-move-column">
            <div className="flex gap-2">
              <Select
                id="task-move-column"
                value={pendingColumnId ?? draft.column}
                onChange={(event) => setPendingColumnId(Number(event.target.value))}
                disabled={moveBusy}
              >
                {columns.map((col) => (
                  <option key={col.id} value={col.id}>{col.name}</option>
                ))}
              </Select>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={handleMove}
                loading={moveBusy}
                disabled={!pendingColumnId || pendingColumnId === draft.column || moveBusy}
                className="shrink-0"
              >
                Переместить
              </Button>
            </div>
          </Field>
        ) : null}
      </div>
    </SurfaceCard>
  )
}
