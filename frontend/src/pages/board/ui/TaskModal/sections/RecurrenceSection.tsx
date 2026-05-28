import { Badge, Card as SurfaceCard, Select, Skeleton, TextInput } from '@/components/ui'
import type { RecurrenceSectionProps } from '../TaskModal.types'

const PRESETS = [
  ['none', 'Не повторять'],
  ['daily', 'Каждый день'],
  ['weekdays', 'По будням'],
  ['weekly', 'Каждую неделю'],
  ['monthly', 'Каждый месяц'],
  ['yearly', 'Каждый год'],
] as const

const WEEKDAY_NAMES_RU = ['понедельник', 'вторник', 'среду', 'четверг', 'пятницу', 'субботу', 'воскресенье']
const ORDINAL_RU = ['', 'первый', 'второй', 'третий', 'четвёртый', 'пятый']
const ORDINAL_RU_LAST = 'последний'

function describeMonthlyRule(byweekday: number[], bysetpos: number | null): string | null {
  if (!byweekday.length || bysetpos === null) return null
  const weekdayName = WEEKDAY_NAMES_RU[byweekday[0] ?? 0] ?? ''
  const ordinal = bysetpos === -1 ? ORDINAL_RU_LAST : (ORDINAL_RU[bysetpos] ?? `${bysetpos}-й`)
  return `каждый ${ordinal} ${weekdayName} месяца`
}

export function RecurrenceSection({
  draft,
  recurrenceRule,
  recurrenceDraft,
  setRecurrenceDraft,
  recurrencePreset,
  recurrenceLoading,
  recurrenceBusy,
  recurrenceError,
  applyRecurrencePreset,
}: RecurrenceSectionProps) {
  const enabled = recurrencePreset !== 'none'
  const monthlyDescription = enabled && recurrencePreset === 'monthly'
    ? describeMonthlyRule(recurrenceDraft.byweekday, recurrenceDraft.bysetpos)
    : null

  return (
    <SurfaceCard as="section" className="space-y-4">
      <div>
        <div className="flex items-center gap-2">
          <Badge variant="info">Repeat</Badge>
          <Badge variant={enabled ? 'primary' : 'neutral'}>{enabled ? 'Включено' : 'Выключено'}</Badge>
        </div>
        <h3 className="mt-3 text-h3 text-text">Повторение</h3>
        <p className="mt-1 text-body-sm text-text-muted">Приложение будет создавать следующую такую же задачу по выбранному расписанию. Изменения в этой задаче не затронут уже созданные повторения.</p>
      </div>

      {recurrenceLoading ? <Skeleton className="h-20 w-full" /> : null}
      {recurrenceError ? <p className="text-caption text-danger" role="alert">{recurrenceError}</p> : null}
      {!draft.deadline ? (
        <div className="rounded-panel border border-dashed border-warning/35 bg-warning/10 px-4 py-3 text-caption text-warning">
          Для точного расписания задайте срок выполнения. Без срока первая копия будет рассчитана от текущего времени.
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1 text-caption text-text-muted">
          <span>Пресет</span>
          <Select value={recurrencePreset} onChange={(event) => applyRecurrencePreset(event.target.value as typeof recurrencePreset)} disabled={recurrenceBusy || recurrenceLoading}>
            {PRESETS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </Select>
        </label>
        <label className="space-y-1 text-caption text-text-muted">
          <span>Повторять каждые</span>
          <TextInput
            type="number"
            min={1}
            max={365}
            value={recurrenceDraft.interval}
            disabled={!enabled || recurrenceBusy || recurrenceLoading}
            onChange={(event) => setRecurrenceDraft((prev) => ({ ...prev, interval: Math.max(1, Number(event.target.value) || 1) }))}
          />
        </label>
        <label className="space-y-1 text-caption text-text-muted">
          <span>До даты</span>
          <TextInput
            type="date"
            value={recurrenceDraft.until ?? ''}
            disabled={!enabled || recurrenceBusy || recurrenceLoading}
            onChange={(event) => setRecurrenceDraft((prev) => ({ ...prev, until: event.target.value || null }))}
          />
        </label>
        <label className="space-y-1 text-caption text-text-muted">
          <span>Остановить после</span>
          <TextInput
            type="number"
            min={1}
            value={recurrenceDraft.count ?? ''}
            placeholder="Без ограничения"
            disabled={!enabled || recurrenceBusy || recurrenceLoading}
            onChange={(event) => setRecurrenceDraft((prev) => ({ ...prev, count: event.target.value ? Math.max(1, Number(event.target.value) || 1) : null }))}
          />
        </label>
      </div>

      {monthlyDescription ? <p className="text-caption text-text-muted">Расписание: {monthlyDescription}.</p> : null}
      {enabled
        ? <p className="text-caption text-text-muted">Следующая задача будет создана примерно: {formatDateTime(estimateNextDue(recurrenceDraft, draft.deadline).toISOString())}</p>
        : null}
      <p className="text-caption text-text-muted">Изменения сохраняются общей кнопкой «Сохранить».</p>
    </SurfaceCard>
  )
}

function formatDateTime(value: string) {
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value
  return parsed.toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function estimateNextDue(
  draft: { freq: string; interval: number; byweekday: number[] },
  deadline: string | null | undefined,
): Date {
  const base = deadline ? new Date(deadline) : new Date()
  const d = Number.isNaN(base.getTime()) ? new Date() : base
  const interval = Math.max(1, draft.interval || 1)

  if (draft.freq === 'daily') {
    const next = new Date(d)
    next.setDate(next.getDate() + interval)
    return next
  }
  if (draft.freq === 'weekly') {
    if (draft.byweekday.length > 0) {
      for (let offset = 1; offset <= 8 * interval; offset++) {
        const candidate = new Date(d)
        candidate.setDate(candidate.getDate() + offset)
        const mondayBased = (candidate.getDay() + 6) % 7
        if (draft.byweekday.includes(mondayBased)) return candidate
      }
    }
    const next = new Date(d)
    next.setDate(next.getDate() + 7 * interval)
    return next
  }
  if (draft.freq === 'monthly') {
    const next = new Date(d)
    next.setMonth(next.getMonth() + interval)
    return next
  }
  if (draft.freq === 'yearly') {
    const next = new Date(d)
    next.setFullYear(next.getFullYear() + interval)
    return next
  }
  const next = new Date(d)
  next.setDate(next.getDate() + interval)
  return next
}
