import { Badge, Button, Card as SurfaceCard, Chip, ChipButton, TextInput } from '@/components/ui'
import type { LabelsSectionProps } from '../TaskModal.types'

export function LabelsSection({ allKnownLabels, selectedLabels, newLabel, setNewLabel, addLabelValue, removeLabel, addLabel }: LabelsSectionProps) {
  const filteredLabels = allKnownLabels
    .filter((label) => !selectedLabels.some((selected) => selected.name === label.name))
    .filter((label) => (newLabel.trim() ? label.name.toLowerCase().includes(newLabel.trim().toLowerCase()) : true))

  return (
    <SurfaceCard as="section" className="space-y-4">
      <div>
        <div className="flex items-center gap-2">
          <Badge variant="success">Tags</Badge>
        </div>
        <h3 className="mt-3 text-h3 text-text">Теги</h3>
      </div>
      <div className="grid gap-4">
        <div className="rounded-panel border border-border/70 bg-background-subtle/55 p-4 text-caption text-text-muted">
          <p className="font-semibold text-text">Доступные теги</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {allKnownLabels.length === 0 ? <span>Пока нет тегов в этой доске.</span> : null}
            {filteredLabels.map((label) => (
              <ChipButton key={label.name} onClick={() => addLabelValue(label)} style={{ borderColor: label.color, color: label.color }}>
                + {label.name}
              </ChipButton>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {selectedLabels.length === 0 ? (
            <span className="text-caption text-text-muted">Теги не добавлены.</span>
          ) : (
            selectedLabels.map((label) => (
              <Chip key={label.name} style={{ borderColor: label.color, backgroundColor: `${label.color}1a`, color: label.color }}>
                {label.name}
                <button type="button" onClick={() => removeLabel(label.name)} className="text-danger hover:text-danger/80" aria-label={`Удалить тег ${label.name}`}>
                  ×
                </button>
              </Chip>
            ))
          )}
        </div>
        <div className="flex items-center gap-2">
          <TextInput value={newLabel} onChange={(event) => setNewLabel(event.target.value)} placeholder="Новый тег" />
          <Button type="button" onClick={addLabel} size="sm">Добавить</Button>
        </div>
      </div>
    </SurfaceCard>
  )
}
