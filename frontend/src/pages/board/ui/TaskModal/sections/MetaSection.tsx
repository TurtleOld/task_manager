import { Badge, Card as SurfaceCard, Field, Select, TextInput } from '../../../../../shared/ui'
import type { MetaSectionProps } from '../TaskModal.types'

export function MetaSection({ draft, setDraft, assignees, selectedCardId, profileTimeZone, getTimeZoneLabel, scheduleDeadlineSave }: MetaSectionProps) {
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
      </div>
    </SurfaceCard>
  )
}
