import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { Repeat } from 'lucide-react'
import { Button, ChipButton, Field, Select, TextInput } from '@/components/ui'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { api } from '../../../api/client'
import { queryKeys } from '../../../api/queries/keys'
import type { RecurrenceRule } from '../../../api/types'
import { POSITION_OPTIONS, PRESETS, UNIT_FORMS, WEEKDAY_LABELS, summarizeRecurrence } from '../lib/recurrence'
import type { RecurrenceFreq } from '../lib/recurrence'
import { russianPlural } from '../lib/taskFormat'
import { MenuOption, PropertyButton, propertyPopoverClass } from './property'

interface RecurrencePropertyProps {
  listId: number
  cardId: number
}

type MonthlyMode = 'day_of_month' | 'nth_weekday'

/** Draft shape: UI-only fields (monthlyMode) alongside what the PUT endpoint accepts as strings. */
interface RecurrenceDraft {
  freq: RecurrenceFreq
  interval: number
  byweekday: number[]
  monthlyMode: MonthlyMode
  nthWeekday: number
  bysetpos: number
  byday: number | null
  until: string
  count: string
}

function draftFromRule(rule: RecurrenceRule | null): RecurrenceDraft {
  return {
    freq: rule?.freq ?? 'daily',
    interval: rule?.interval ?? 1,
    byweekday: rule?.byweekday ?? [],
    monthlyMode: rule?.bysetpos != null ? 'nth_weekday' : 'day_of_month',
    nthWeekday: rule?.byweekday?.[0] ?? 0,
    bysetpos: rule?.bysetpos ?? 1,
    byday: rule?.byday ?? null,
    until: rule?.until ?? '',
    count: rule?.count != null ? String(rule.count) : '',
  }
}

/** What the PUT /recurrence/ endpoint accepts. */
type RecurrencePayload = Pick<RecurrenceRule, 'freq' | 'interval' | 'byweekday' | 'byday' | 'bysetpos' | 'until' | 'count'>

function buildPayload(draft: RecurrenceDraft): RecurrencePayload {
  const interval = Math.max(1, Math.trunc(draft.interval) || 1)
  const count = draft.count.trim() ? Math.max(1, Math.trunc(Number(draft.count))) : null
  const until = draft.until || null

  if (draft.freq === 'weekly') {
    return { freq: 'weekly', interval, byweekday: draft.byweekday, byday: null, bysetpos: null, until, count }
  }
  if (draft.freq === 'monthly' && draft.monthlyMode === 'nth_weekday') {
    return {
      freq: 'monthly',
      interval,
      byweekday: [draft.nthWeekday],
      byday: null,
      bysetpos: draft.bysetpos,
      until,
      count,
    }
  }
  if (draft.freq === 'monthly' || draft.freq === 'yearly') {
    return { freq: draft.freq, interval, byweekday: [], byday: draft.byday, bysetpos: null, until, count }
  }
  return { freq: 'daily', interval, byweekday: [], byday: null, bysetpos: null, until, count }
}

function presetPayload(freq: RecurrenceFreq): RecurrencePayload {
  return { freq, interval: 1, byweekday: [], byday: null, bysetpos: null, until: null, count: null }
}

function isPreset(rule: RecurrenceRule, freq: RecurrenceFreq): boolean {
  return (
    rule.freq === freq &&
    rule.interval === 1 &&
    rule.byweekday.length === 0 &&
    rule.bysetpos == null &&
    rule.until == null &&
    rule.count == null
  )
}

export function RecurrenceProperty({ cardId, listId }: RecurrencePropertyProps) {
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)
  const [custom, setCustom] = useState(false)

  const query = useQuery({
    queryKey: queryKeys.cardRecurrence(cardId),
    queryFn: () => api.getCardRecurrence(cardId),
  })

  const rule = query.data ?? null
  const isStale = rule !== null && !rule.is_current
  const [draft, setDraft] = useState<RecurrenceDraft>(() => draftFromRule(rule))

  // Re-sync the draft from the server whenever the rule changes underneath us
  // (realtime update, another tab), but not while the user is mid-edit.
  useEffect(() => {
    if (!custom) setDraft(draftFromRule(rule))
  }, [rule, custom])

  const close = () => {
    setOpen(false)
    setCustom(false)
  }

  const invalidate = () => qc.invalidateQueries({ queryKey: queryKeys.cardRecurrence(cardId) })

  const save = useMutation({
    mutationFn: (payload: RecurrencePayload) => api.saveCardRecurrence(cardId, payload),
    onSuccess: () => {
      void invalidate()
      close()
    },
    onError: () => toast.error('Не удалось сохранить повтор'),
  })

  const remove = useMutation({
    mutationFn: () => api.deleteCardRecurrence(cardId),
    onSuccess: () => {
      void invalidate()
      close()
    },
    onError: () => toast.error('Не удалось выключить повтор'),
  })

  const toggleWeekday = (day: number) => {
    setDraft((prev) => ({
      ...prev,
      byweekday: prev.byweekday.includes(day)
        ? prev.byweekday.filter((d) => d !== day)
        : [...prev.byweekday, day].sort((a, b) => a - b),
    }))
  }

  const [one, few, many] = UNIT_FORMS[draft.freq]

  return (
    <Popover open={open} onOpenChange={(next) => (next ? setOpen(true) : close())}>
      <PopoverTrigger asChild>
        <PropertyButton tone={rule ? 'set' : 'empty'} disabled={query.isLoading} aria-label={rule ? `Повтор: ${summarizeRecurrence(rule)}` : 'Настроить повтор'}>
          <Repeat aria-hidden="true" />
          {rule ? summarizeRecurrence(rule) : 'Повтор'}
        </PropertyButton>
      </PopoverTrigger>
      <PopoverContent align="start" className={custom ? `${propertyPopoverClass} w-80 p-4` : propertyPopoverClass}>
        {isStale && rule ? (
          <p className="max-w-64 p-2 text-body-sm text-text-muted">
            Повтор настраивается в{' '}
            <Link to={`/lists/${listId}/tasks/${rule.current_card_id}`} className="text-primary hover:underline" onClick={close}>
              актуальной задаче серии
            </Link>
            .
          </p>
        ) : custom ? (
          <div className="space-y-3">
            <div className="flex flex-wrap items-end gap-2">
              <Field label="Каждые" htmlFor="recurrence-interval">
                <TextInput
                  id="recurrence-interval"
                  type="number"
                  min={1}
                  value={draft.interval}
                  onChange={(event) => setDraft((prev) => ({ ...prev, interval: Number(event.target.value) }))}
                  className="w-20 tabular-nums"
                />
              </Field>
              <Select
                aria-label="Единица повтора"
                value={draft.freq}
                onChange={(event) => setDraft((prev) => ({ ...prev, freq: event.target.value as RecurrenceFreq }))}
                className="w-36"
              >
                <option value="daily">{russianPlural(draft.interval, 'день', 'дня', 'дней')}</option>
                <option value="weekly">{russianPlural(draft.interval, 'неделю', 'недели', 'недель')}</option>
                <option value="monthly">{russianPlural(draft.interval, 'месяц', 'месяца', 'месяцев')}</option>
                <option value="yearly">{russianPlural(draft.interval, 'год', 'года', 'лет')}</option>
              </Select>
            </div>

            {draft.freq === 'weekly' ? (
              <div className="flex flex-wrap gap-1.5" role="group" aria-label="Дни недели">
                {WEEKDAY_LABELS.map((label, day) => (
                  <ChipButton key={day} active={draft.byweekday.includes(day)} onClick={() => toggleWeekday(day)}>
                    {label}
                  </ChipButton>
                ))}
              </div>
            ) : null}

            {draft.freq === 'monthly' ? (
              <div className="space-y-2">
                <div className="flex flex-wrap gap-1.5" role="group" aria-label="Какой день месяца">
                  <ChipButton
                    active={draft.monthlyMode === 'day_of_month'}
                    onClick={() => setDraft((prev) => ({ ...prev, monthlyMode: 'day_of_month' }))}
                  >
                    То же число
                  </ChipButton>
                  <ChipButton
                    active={draft.monthlyMode === 'nth_weekday'}
                    onClick={() => setDraft((prev) => ({ ...prev, monthlyMode: 'nth_weekday' }))}
                  >
                    По дню недели
                  </ChipButton>
                </div>
                {draft.monthlyMode === 'nth_weekday' ? (
                  <div className="flex gap-2">
                    <Select
                      value={draft.bysetpos}
                      onChange={(event) => setDraft((prev) => ({ ...prev, bysetpos: Number(event.target.value) }))}
                      aria-label="Позиция в месяце"
                    >
                      {POSITION_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </Select>
                    <Select
                      value={draft.nthWeekday}
                      onChange={(event) => setDraft((prev) => ({ ...prev, nthWeekday: Number(event.target.value) }))}
                      aria-label="День недели"
                    >
                      {WEEKDAY_LABELS.map((label, day) => (
                        <option key={day} value={day}>{label}</option>
                      ))}
                    </Select>
                  </div>
                ) : null}
              </div>
            ) : null}

            {(draft.freq === 'monthly' && draft.monthlyMode === 'day_of_month') || draft.freq === 'yearly' ? (
              <Field label="Число месяца (по умолчанию как в сроке)" htmlFor="recurrence-byday">
                <TextInput
                  id="recurrence-byday"
                  type="number"
                  min={1}
                  max={31}
                  value={draft.byday ?? ''}
                  onChange={(event) =>
                    setDraft((prev) => ({ ...prev, byday: event.target.value ? Number(event.target.value) : null }))
                  }
                  className="w-20 tabular-nums"
                  placeholder="—"
                />
              </Field>
            ) : null}

            <div className="flex gap-2">
              <Field label="До даты" htmlFor="recurrence-until">
                <TextInput
                  id="recurrence-until"
                  type="date"
                  value={draft.until}
                  onChange={(event) => setDraft((prev) => ({ ...prev, until: event.target.value }))}
                />
              </Field>
              <Field label="Раз" htmlFor="recurrence-count">
                <TextInput
                  id="recurrence-count"
                  type="number"
                  min={1}
                  value={draft.count}
                  onChange={(event) => setDraft((prev) => ({ ...prev, count: event.target.value }))}
                  className="w-20 tabular-nums"
                  placeholder="—"
                />
              </Field>
            </div>

            <div className="flex items-center justify-between gap-2 pt-1">
              <span className="text-caption text-text-muted">
                Каждые {Math.max(1, Math.trunc(draft.interval) || 1)} {russianPlural(Math.max(1, Math.trunc(draft.interval) || 1), one, few, many)}
              </span>
              <div className="flex gap-2">
                <Button type="button" size="sm" variant="ghost" onClick={() => setCustom(false)}>
                  Назад
                </Button>
                <Button type="button" size="sm" onClick={() => save.mutate(buildPayload(draft))} loading={save.isPending}>
                  Сохранить
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <div role="menu" aria-label="Повтор">
            {rule ? (
              <MenuOption onSelect={() => remove.mutate()}>Не повторять</MenuOption>
            ) : null}
            {PRESETS.map((preset) => (
              <MenuOption
                key={preset.freq}
                selected={rule != null && isPreset(rule, preset.freq)}
                onSelect={() => save.mutate(presetPayload(preset.freq))}
              >
                {preset.label}
              </MenuOption>
            ))}
            <div className="my-1 h-px bg-border/60" />
            <MenuOption onSelect={() => setCustom(true)} selected={rule != null && !PRESETS.some((preset) => isPreset(rule, preset.freq))}>
              {rule && !PRESETS.some((preset) => isPreset(rule, preset.freq)) ? summarizeRecurrence(rule) : 'Своё правило…'}
            </MenuOption>
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}
