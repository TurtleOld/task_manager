import { useState } from 'react'
import type { FormEvent } from 'react'
import { Chip, TextInput } from '@/components/ui'
import { parseQuickAdd } from '../lib/quickAdd'
import type { QuickAddPerson } from '../lib/quickAdd'

export interface QuickAddResult {
  title: string
  deadline: string | null
  assigneeId: number | null
  assigneeName: string
  tag: string | null
}

interface QuickAddDismissed {
  deadline: boolean
  assignee: boolean
  tag: boolean
}

const NOTHING_DISMISSED: QuickAddDismissed = { deadline: false, assignee: false, tag: false }

interface QuickAddBarProps {
  busy?: boolean
  onSubmit: (result: QuickAddResult) => void
  people: QuickAddPerson[]
  timeZone?: string | null
}

export function QuickAddBar({ busy = false, onSubmit, people, timeZone }: QuickAddBarProps) {
  const [value, setValue] = useState('')
  const [dismissed, setDismissed] = useState<QuickAddDismissed>(NOTHING_DISMISSED)

  const parsed = value.trim() ? parseQuickAdd(value, { people, timeZone }) : null

  const handleChange = (next: string) => {
    setValue(next)
    setDismissed(NOTHING_DISMISSED)
  }

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    if (!parsed || !parsed.title || busy) return
    onSubmit({
      title: parsed.title,
      deadline: dismissed.deadline ? null : parsed.deadline,
      assigneeId: dismissed.assignee ? null : parsed.assigneeId,
      assigneeName: dismissed.assignee ? '' : parsed.assigneeName,
      tag: dismissed.tag ? null : parsed.tag,
    })
    setValue('')
    setDismissed(NOTHING_DISMISSED)
  }

  return (
    <form onSubmit={handleSubmit} className="flex min-w-0 flex-1 items-center gap-1.5">
      <TextInput
        aria-label="Быстрое добавление задачи"
        className="h-9 min-w-[7rem] flex-1"
        disabled={busy}
        fullWidth={false}
        onChange={(event) => handleChange(event.target.value)}
        placeholder="Добавить задачу: «полить цветы завтра в 8 @лиза #дом»"
        value={value}
      />
      {parsed?.deadlineText && !dismissed.deadline ? (
        <RemovableChip
          label={parsed.deadlineText}
          onRemove={() => setDismissed((state) => ({ ...state, deadline: true }))}
        />
      ) : null}
      {parsed?.assigneeName && !dismissed.assignee ? (
        <RemovableChip
          label={`@${parsed.assigneeName}`}
          onRemove={() => setDismissed((state) => ({ ...state, assignee: true }))}
        />
      ) : null}
      {parsed?.tag && !dismissed.tag ? (
        <RemovableChip label={`#${parsed.tag}`} onRemove={() => setDismissed((state) => ({ ...state, tag: true }))} />
      ) : null}
    </form>
  )
}

function RemovableChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <Chip className="shrink-0" tone="primary">
      <span className="max-w-[8rem] truncate">{label}</span>
      <button
        aria-label={`Убрать «${label}»`}
        className="text-primary/70 hover:text-primary"
        onClick={onRemove}
        type="button"
      >
        ×
      </button>
    </Chip>
  )
}
