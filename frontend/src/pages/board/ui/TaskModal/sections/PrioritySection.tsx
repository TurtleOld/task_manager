import { Label as RadixLabel } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { cn } from '@/lib/utils'
import { Badge, Card as SurfaceCard } from '../../../../../shared/ui'
import type { BoardPriority } from '../../../types'
import { priorityToLabel, priorityToMarker } from '../../../lib/priority'
import type { PrioritySectionProps } from '../TaskModal.types'

const priorityOptions = [
  { value: 3 as BoardPriority, marker: '🔥', label: 'Срочно', description: 'Нужно обработать в первую очередь' },
  { value: 2 as BoardPriority, marker: '🟡', label: 'Важно', description: 'Желательно закрыть до конца недели' },
  { value: 1 as BoardPriority, marker: '🟢', label: 'Можно позже', description: 'Не блокирует текущую работу' },
]

export function PrioritySection({ setDraft, selectedCardId, selectedPriority }: PrioritySectionProps) {
  return (
    <SurfaceCard as="section" className="space-y-4">
      <div>
        <div className="flex items-center gap-2">
          <Badge variant="warning">Priority</Badge>
          <Badge variant="neutral">
            {selectedPriority === '' ? 'Не выбран' : `${priorityToMarker(selectedPriority)} ${priorityToLabel(selectedPriority)}`}
          </Badge>
        </div>
        <h3 className="mt-3 text-h3 text-text">Приоритет</h3>
      </div>
      <RadioGroup
        className="grid gap-2"
        value={selectedPriority === '' ? undefined : String(selectedPriority)}
        onValueChange={(value) => {
          if (!selectedCardId) return
          setDraft((prev) => (prev ? { ...prev, priority: Number(value) as BoardPriority } : prev))
        }}
      >
        {priorityOptions.map((item) => {
          const checked = selectedPriority === item.value
          return (
            <RadixLabel
              key={item.label}
              htmlFor={`priority-${item.value}`}
              className={cn(
                'flex cursor-pointer items-start gap-3 rounded-control border px-3.5 py-3 text-body-sm backdrop-blur transition duration-fast ease-standard',
                checked ? 'border-primary/35 bg-primary/10 text-text shadow-surface' : 'border-border bg-surface/90 text-text hover:border-primary/30 hover:bg-surface-hover',
              )}
            >
              <RadioGroupItem id={`priority-${item.value}`} value={String(item.value)} className="mt-0.5" />
              <span>
                <span className="block font-semibold">{item.marker} {item.label}</span>
                <span className="mt-1 block text-caption text-text-muted">{item.description}</span>
              </span>
            </RadixLabel>
          )
        })}
      </RadioGroup>
    </SurfaceCard>
  )
}
