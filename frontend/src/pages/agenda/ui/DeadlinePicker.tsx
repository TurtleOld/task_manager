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

const DEFAULT_TIME = '18:00'

function timeOf(deadline: string | null, timeZone: string): string {
  if (!deadline) return DEFAULT_TIME
  const local = formatIsoForTimeZone(deadline, timeZone)
  return local.split('T')[1] ?? DEFAULT_TIME
}

export function DeadlinePicker({ boundaries, busy = false, className, deadline, displayText, onCommit }: DeadlinePickerProps) {
  const [open, setOpen] = useState(false)
  const timeZone = boundaries.timezone
  const selected = deadline ? new Date(formatIsoForTimeZone(deadline, timeZone)) : undefined

  const [pendingTime, setPendingTime] = useState(() => timeOf(deadline, timeZone))

  const handleOpenChange = (next: boolean) => {
    setOpen(next)
    if (next) setPendingTime(timeOf(deadline, timeZone))
  }

  const commitClear = () => {
    setOpen(false)
    onCommit(null)
  }

  const toIso = (date: Date, time: string) => {
    const local = [
      date.getFullYear(),
      String(date.getMonth() + 1).padStart(2, '0'),
      String(date.getDate()).padStart(2, '0'),
    ].join('-') + `T${time}`
    return zonedDateTimeLocalToIso(local, timeZone)
  }

  const commitDate = (date: Date | undefined) => {
    setOpen(false)
    onCommit(date ? toIso(date, pendingTime) : null)
  }

  const commitTime = (time: string) => {
    setPendingTime(time)
    if (selected) onCommit(toIso(selected, time))
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
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
            onSelect={(next) => commitDate(next)}
            autoFocus
          />
          <label className="flex items-center gap-2 px-1 text-caption text-text-muted">
            Время
            <input
              type="time"
              value={pendingTime}
              onChange={(event) => commitTime(event.target.value || DEFAULT_TIME)}
              className="h-8 flex-1 rounded-control border border-border/90 bg-surface px-2 text-body-sm text-text"
            />
          </label>
          {deadline ? (
            <button
              type="button"
              onClick={commitClear}
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
