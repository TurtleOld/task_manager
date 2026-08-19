import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Repeat, Trash2 } from 'lucide-react'
import { Badge, Button, Card as SurfaceCard, ChipButton, EmptyState, Field, Select, TextInput } from '@/components/ui'
import { api } from '../../../api/client'
import { queryKeys } from '../../../api/queries/keys'
import type { RecurrenceRule } from '../../../api/types'

interface RecurrencePanelProps {
  cardId: number
  hasDeadline: boolean
}

type RecurrenceFreq = RecurrenceRule['freq']
type MonthlyMode = 'day_of_month' | 'nth_weekday'

const WEEKDAY_LABELS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']

const POSITION_OPTIONS: Array<{ value: number; label: string }> = [
  { value: 1, label: '1-й' },
  { value: 2, label: '2-й' },
  { value: 3, label: '3-й' },
  { value: 4, label: '4-й' },
  { value: -1, label: 'последний' },
]

const INTERVAL_UNIT_LABEL: Record<RecurrenceFreq, string> = {
  daily: 'дней',
  weekly: 'недель',
  monthly: 'месяцев',
  yearly: 'лет',
}

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

function summarize(rule: RecurrenceRule): string {
  const n = rule.interval
  if (rule.freq === 'daily') return n === 1 ? 'Каждый день' : `Каждые ${n} дн.`

  if (rule.freq === 'weekly') {
    const base = n === 1 ? 'Каждую неделю' : `Каждые ${n} нед.`
    const days = rule.byweekday.map((day) => WEEKDAY_LABELS[day]).join(', ')
    return days ? `${base} (${days})` : base
  }

  if (rule.freq === 'monthly') {
    const base = n === 1 ? 'Каждый месяц' : `Каждые ${n} мес.`
    const weekday = rule.byweekday[0]
    if (rule.bysetpos != null && weekday != null) {
      const position = POSITION_OPTIONS.find((option) => option.value === rule.bysetpos)?.label ?? rule.bysetpos
      return `${base}, ${position} ${WEEKDAY_LABELS[weekday]}`
    }
    return base
  }

  return n === 1 ? 'Каждый год' : `Каждые ${n} лет`
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

export function RecurrencePanel({ cardId, hasDeadline }: RecurrencePanelProps) {
  const qc = useQueryClient()
  const [editing, setEditing] = useState(false)

  const query = useQuery({
    queryKey: queryKeys.cardRecurrence(cardId),
    queryFn: () => api.getCardRecurrence(cardId),
  })

  const rule = query.data ?? null
  const [draft, setDraft] = useState<RecurrenceDraft>(() => draftFromRule(rule))

  // Re-sync the draft from the server whenever the rule changes underneath us
  // (realtime update, another tab), but not while the user is mid-edit.
  useEffect(() => {
    if (!editing) setDraft(draftFromRule(rule))
  }, [rule, editing])

  const invalidate = () => qc.invalidateQueries({ queryKey: queryKeys.cardRecurrence(cardId) })

  const save = useMutation({
    mutationFn: (payload: RecurrencePayload) => api.saveCardRecurrence(cardId, payload),
    onSuccess: () => {
      invalidate()
      setEditing(false)
      toast.success('Повтор сохранён')
    },
    onError: () => toast.error('Не удалось сохранить повтор'),
  })

  const remove = useMutation({
    mutationFn: () => api.deleteCardRecurrence(cardId),
    onSuccess: () => {
      invalidate()
      setEditing(false)
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

  if (!hasDeadline) {
    return (
      <SurfaceCard as="section" className="space-y-3 p-5">
        <Badge variant="info">Повтор</Badge>
        <EmptyState title="Сначала задайте срок" className="p-4">
          Повтор отсчитывается от срока задачи, поэтому без него настраивать нечего.
        </EmptyState>
      </SurfaceCard>
    )
  }

  return (
    <SurfaceCard as="section" className="space-y-3 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Badge variant="info">Повтор</Badge>
          {rule && !editing ? <Badge variant="neutral">{summarize(rule)}</Badge> : null}
        </div>

        {rule && !editing ? (
          <div className="flex items-center gap-2">
            <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(true)}>
              Изменить
            </Button>
            <button
              type="button"
              onClick={() => remove.mutate()}
              aria-label="Выключить повтор"
              disabled={remove.isPending}
              className="text-text-muted transition hover:text-danger disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Trash2 className="size-4" aria-hidden />
            </button>
          </div>
        ) : null}

        {!rule && !editing && !query.isLoading ? (
          <Button type="button" size="sm" onClick={() => setEditing(true)}>
            <Repeat className="size-4" aria-hidden />
            Настроить повтор
          </Button>
        ) : null}
      </div>

      {query.isLoading ? (
        <p className="text-body-sm text-text-muted">Загружаем…</p>
      ) : !rule && !editing ? (
        <EmptyState title="Не повторяется" className="p-4">
          Настройте повтор, чтобы задача создавалась заново по расписанию после выполнения.
        </EmptyState>
      ) : editing ? (
        <div className="space-y-3">
          <div className="flex flex-wrap items-end gap-3">
            <Field label="Частота" htmlFor="recurrence-freq">
              <Select
                id="recurrence-freq"
                value={draft.freq}
                onChange={(event) => setDraft((prev) => ({ ...prev, freq: event.target.value as RecurrenceFreq }))}
                className="w-40"
              >
                <option value="daily">Ежедневно</option>
                <option value="weekly">Еженедельно</option>
                <option value="monthly">Ежемесячно</option>
                <option value="yearly">Ежегодно</option>
              </Select>
            </Field>

            <Field label={`Каждые N ${INTERVAL_UNIT_LABEL[draft.freq]}`} htmlFor="recurrence-interval">
              <TextInput
                id="recurrence-interval"
                type="number"
                min={1}
                value={draft.interval}
                onChange={(event) => setDraft((prev) => ({ ...prev, interval: Number(event.target.value) }))}
                className="w-24"
              />
            </Field>
          </div>

          {draft.freq === 'weekly' ? (
            <Field label="Дни недели" htmlFor="recurrence-weekdays">
              <div className="flex flex-wrap gap-2" id="recurrence-weekdays">
                {WEEKDAY_LABELS.map((label, day) => (
                  <ChipButton key={day} active={draft.byweekday.includes(day)} onClick={() => toggleWeekday(day)}>
                    {label}
                  </ChipButton>
                ))}
              </div>
            </Field>
          ) : null}

          {draft.freq === 'monthly' ? (
            <Field label="Какой день месяца" htmlFor="recurrence-monthly-mode">
              <div className="flex flex-wrap items-center gap-2" id="recurrence-monthly-mode">
                <ChipButton
                  active={draft.monthlyMode === 'day_of_month'}
                  onClick={() => setDraft((prev) => ({ ...prev, monthlyMode: 'day_of_month' }))}
                >
                  Тот же день месяца
                </ChipButton>
                <ChipButton
                  active={draft.monthlyMode === 'nth_weekday'}
                  onClick={() => setDraft((prev) => ({ ...prev, monthlyMode: 'nth_weekday' }))}
                >
                  По дню недели
                </ChipButton>
              </div>
              {draft.monthlyMode === 'nth_weekday' ? (
                <div className="mt-2 flex flex-wrap gap-2">
                  <Select
                    value={draft.bysetpos}
                    onChange={(event) => setDraft((prev) => ({ ...prev, bysetpos: Number(event.target.value) }))}
                    className="w-32"
                    aria-label="Позиция в месяце"
                  >
                    {POSITION_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </Select>
                  <Select
                    value={draft.nthWeekday}
                    onChange={(event) => setDraft((prev) => ({ ...prev, nthWeekday: Number(event.target.value) }))}
                    className="w-32"
                    aria-label="День недели"
                  >
                    {WEEKDAY_LABELS.map((label, day) => (
                      <option key={day} value={day}>
                        {label}
                      </option>
                    ))}
                  </Select>
                </div>
              ) : null}
            </Field>
          ) : null}

          {(draft.freq === 'monthly' && draft.monthlyMode === 'day_of_month') || draft.freq === 'yearly' ? (
            <Field label="День месяца (по умолчанию — как в сроке задачи)" htmlFor="recurrence-byday">
              <TextInput
                id="recurrence-byday"
                type="number"
                min={1}
                max={31}
                value={draft.byday ?? ''}
                onChange={(event) =>
                  setDraft((prev) => ({ ...prev, byday: event.target.value ? Number(event.target.value) : null }))
                }
                className="w-24"
                placeholder="—"
              />
            </Field>
          ) : null}

          <div className="flex flex-wrap gap-3">
            <Field label="Повторять до (необязательно)" htmlFor="recurrence-until">
              <TextInput
                id="recurrence-until"
                type="date"
                value={draft.until}
                onChange={(event) => setDraft((prev) => ({ ...prev, until: event.target.value }))}
                className="w-40"
              />
            </Field>
            <Field label="Сколько раз (необязательно)" htmlFor="recurrence-count">
              <TextInput
                id="recurrence-count"
                type="number"
                min={1}
                value={draft.count}
                onChange={(event) => setDraft((prev) => ({ ...prev, count: event.target.value }))}
                className="w-24"
                placeholder="—"
              />
            </Field>
          </div>

          <div className="flex items-center gap-2">
            <Button type="button" size="sm" onClick={() => save.mutate(buildPayload(draft))} loading={save.isPending}>
              Сохранить
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => {
                setEditing(false)
                setDraft(draftFromRule(rule))
              }}
            >
              Отмена
            </Button>
          </div>
        </div>
      ) : null}
    </SurfaceCard>
  )
}
