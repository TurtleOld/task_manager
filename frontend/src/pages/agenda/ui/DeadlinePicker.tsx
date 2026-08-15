import { useState } from 'react'
import { CalendarDays, CalendarX2 } from 'lucide-react'
import type { AgendaBoundaries } from '../../../api/types'
import { formatIsoForTimeZone, zonedDateTimeLocalToIso } from '../../../shared/lib/timezone'
import { formatDeadlineShort } from '../lib/formatDeadline'
import { cn } from '@/lib/utils'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'

interface DeadlinePickerProps {
  boundaries: AgendaBoundaries
  busy?: boolean
  className?: string
  deadline: string | null
  displayText?: string
  onCommit: (deadline: string | null) => void
}

export function DeadlinePicker({ boundaries, busy = false, className, deadline, displayText, onCommit }: DeadlinePickerProps) {
  const [open, setOpen] = useState(false)
  const timeZone = boundaries.timezone
  const selected = deadline ? new Date(formatIsoForTimeZone(deadline, timeZone)) : undefined

  const commit = (date: Date | undefined) => {
    setOpen(false)
    if (!date) {
      onCommit(null)
      return
    }
    const local = [
      date.getFullYear(),
      String(date.getMonth() + 1).padStart(2, '0'),
      String(date.getDate()).padStart(2, '0'),
    ].join('-') + 'T00:00'
    onCommit(zonedDateTimeLocalToIso(local, timeZone))
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={busy}
          aria-label={deadline ? 'Изменить срок задачи' : 'Задать срок задачи'}
          className={cn(
            'inline-flex h-8 shrink-0 items-center gap-1 rounded-full border border-border/80 bg-background-subtle/70 px-2.5 text-caption text-text-muted transition hover:border-primary/40 hover:text-primary disabled:cursor-not-allowed disabled:opacity-60 compact:h-7',
            className,
          )}
        >
          <CalendarDays className="h-3 w-3" aria-hidden="true" />
          <span>{displayText ?? (deadline ? formatDeadlineShort(deadline, boundaries) : 'Без срока')}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-2">
        <div className="space-y-2">
          <Calendar
            mode="single"
            selected={selected}
            defaultMonth={selected}
            onSelect={(next) => commit(next)}
            autoFocus
          />
          {deadline ? (
            <button
              type="button"
              onClick={() => commit(undefined)}
              className="flex h-8 w-full items-center justify-center gap-1.5 rounded-control border border-border bg-surface px-3 text-caption text-text-muted transition hover:border-danger/40 hover:text-danger"
            >
              <CalendarX2 className="h-3.5 w-3.5" aria-hidden="true" />
              Без срока
            </button>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  )
}
