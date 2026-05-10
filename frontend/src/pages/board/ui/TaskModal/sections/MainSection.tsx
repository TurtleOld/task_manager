import { Card as SurfaceCard, Field, TextInput, Textarea } from '../../../../../shared/ui'
import type { MainSectionProps } from '../TaskModal.types'

export function MainSection({ draft, setDraft }: MainSectionProps) {
  return (
    <SurfaceCard as="section" className="space-y-4">
      <Field label="Заголовок" htmlFor="task-title">
        <TextInput
          id="task-title"
          value={draft.title}
          onChange={(event) => setDraft((prev) => (prev ? { ...prev, title: event.target.value } : prev))}
        />
      </Field>
      <Field label="Подробное описание" htmlFor="task-description">
        <Textarea
          id="task-description"
          rows={6}
          value={draft.description}
          onChange={(event) => setDraft((prev) => (prev ? { ...prev, description: event.target.value } : prev))}
          placeholder="Опишите задачу, ожидания, контекст и критерии готовности"
        />
      </Field>
    </SurfaceCard>
  )
}
