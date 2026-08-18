import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { BellOff, BellRing, Plus, Trash2 } from 'lucide-react'
import { Badge, Button, Card as SurfaceCard, EmptyState, Select } from '@/components/ui'
import { api } from '../../../api/client'
import { queryKeys } from '../../../api/queries/keys'
import type { CardDeadlineReminder, ReminderOffsetUnit } from '../../../api/types'

interface RemindersPanelProps {
  cardId: number
  hasDeadline: boolean
}

/** Draft shape: what the PUT endpoint accepts, without server-side result fields. */
type ReminderDraft = Pick<CardDeadlineReminder, 'enabled' | 'offset_value' | 'offset_unit'>

const OFFSET_PRESETS: Array<{ value: number; unit: ReminderOffsetUnit; label: string }> = [
  { value: 10, unit: 'minutes', label: 'За 10 минут' },
  { value: 30, unit: 'minutes', label: 'За 30 минут' },
  { value: 1, unit: 'hours', label: 'За час' },
  { value: 3, unit: 'hours', label: 'За 3 часа' },
  { value: 24, unit: 'hours', label: 'За сутки' },
]

/**
 * Status copy is deliberately blunt about failure. A reminder that silently
 * did not fire is the exact problem this panel exists to make visible.
 */
function statusBadge(reminder: CardDeadlineReminder): { text: string; variant: 'success' | 'info' | 'neutral' | 'danger' } {
  switch (reminder.status) {
    case 'scheduled':
      return { text: 'Запланировано', variant: 'info' }
    case 'dispatched':
      return { text: 'Отправляется', variant: 'info' }
    case 'sent':
      return { text: 'Отправлено', variant: 'success' }
    case 'disabled':
      return { text: 'Выключено', variant: 'neutral' }
    case 'skipped':
      return { text: 'Пропущено', variant: 'danger' }
    case 'failed':
      return { text: 'Ошибка отправки', variant: 'danger' }
    case 'invalid.no_deadline':
      return { text: 'Нет срока', variant: 'danger' }
    case 'invalid.past':
      return { text: 'Время уже прошло', variant: 'danger' }
    case 'invalid.channel':
      return { text: 'Нет устройств', variant: 'danger' }
    default:
      return { text: reminder.status, variant: 'neutral' }
  }
}

function presetKey(value: number, unit: ReminderOffsetUnit): string {
  return `${value}:${unit}`
}

export function RemindersPanel({ cardId, hasDeadline }: RemindersPanelProps) {
  const qc = useQueryClient()
  const [pendingOffset, setPendingOffset] = useState('30:minutes')

  const query = useQuery({
    queryKey: queryKeys.cardDeadlineReminder(cardId),
    queryFn: () => api.getCardDeadlineReminder(cardId),
  })

  const reminders = query.data?.reminders ?? []
  const channels = query.data?.channels
  const pushAvailable = channels?.push?.available ?? false
  const pushReason = channels?.push?.reason ?? ''

  const save = useMutation({
    mutationFn: (drafts: ReminderDraft[]) => api.saveCardDeadlineReminder(cardId, { reminders: drafts }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.cardDeadlineReminder(cardId) })
    },
    onError: () => toast.error('Не удалось сохранить напоминание'),
  })

  const toDraft = (reminder: CardDeadlineReminder): ReminderDraft => ({
    enabled: reminder.enabled,
    offset_value: reminder.offset_value,
    offset_unit: reminder.offset_unit,
  })

  const commit = (drafts: ReminderDraft[]) => save.mutate(drafts)

  const addReminder = () => {
    const [value, unit] = pendingOffset.split(':')
    commit([
      ...reminders.map(toDraft),
      { enabled: true, offset_value: Number(value), offset_unit: unit as ReminderOffsetUnit },
    ])
  }

  const updateReminder = (index: number, patch: Partial<ReminderDraft>) => {
    commit(reminders.map((item, i) => (i === index ? { ...toDraft(item), ...patch } : toDraft(item))))
  }

  const removeReminder = (index: number) => {
    commit(reminders.filter((_, i) => i !== index).map(toDraft))
  }

  const canAdd = hasDeadline && pushAvailable

  return (
    <SurfaceCard as="section" className="space-y-3 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Badge variant="info">Напоминания</Badge>
          {reminders.length > 0 ? <Badge variant="neutral">{reminders.length}</Badge> : null}
        </div>
        {canAdd ? (
          <div className="flex flex-wrap items-center gap-2">
            <Select
              value={pendingOffset}
              onChange={(event) => setPendingOffset(event.target.value)}
              aria-label="За сколько до срока"
              className="w-40"
            >
              {OFFSET_PRESETS.map((preset) => (
                <option key={presetKey(preset.value, preset.unit)} value={presetKey(preset.value, preset.unit)}>
                  {preset.label}
                </option>
              ))}
            </Select>
            <Button type="button" size="sm" onClick={addReminder} loading={save.isPending}>
              <Plus className="size-4" aria-hidden />
              Добавить
            </Button>
          </div>
        ) : null}
      </div>

      {!hasDeadline ? (
        <EmptyState title="Сначала задайте срок" className="p-4">
          Напоминание отсчитывается от срока задачи, поэтому без него отправлять нечего.
        </EmptyState>
      ) : query.isLoading ? (
        <p className="text-body-sm text-text-muted">Загружаем напоминания…</p>
      ) : !pushAvailable ? (
        <EmptyState title="Некуда отправлять" className="p-4">
          <p>Подключите устройство, чтобы получать напоминания.</p>
          {pushReason ? <p className="mt-1">{pushReason}</p> : null}
          <Link to="/settings" className="mt-2 inline-block text-primary underline-offset-4 hover:text-primary-hover hover:underline">
            Включить уведомления в настройках
          </Link>
        </EmptyState>
      ) : reminders.length === 0 ? (
        <EmptyState title="Напоминаний нет" className="p-4">
          Добавьте напоминание, чтобы получить уведомление до наступления срока.
        </EmptyState>
      ) : (
        <ul className="space-y-2">
          {reminders.map((reminder, index) => {
            const badge = statusBadge(reminder)
            const currentPreset = presetKey(reminder.offset_value, reminder.offset_unit)
            const knownPreset = OFFSET_PRESETS.some(
              (preset) => presetKey(preset.value, preset.unit) === currentPreset,
            )
            return (
              <li
                key={reminder.id}
                className="flex flex-wrap items-center gap-2 rounded-lg border border-border-subtle p-3"
              >
                <button
                  type="button"
                  onClick={() => updateReminder(index, { enabled: !reminder.enabled })}
                  aria-label={reminder.enabled ? 'Выключить напоминание' : 'Включить напоминание'}
                  className="text-text-muted transition hover:text-text"
                >
                  {reminder.enabled ? (
                    <BellRing className="size-4" aria-hidden />
                  ) : (
                    <BellOff className="size-4" aria-hidden />
                  )}
                </button>

                <Select
                  value={currentPreset}
                  onChange={(event) => {
                    const [value, unit] = event.target.value.split(':')
                    updateReminder(index, {
                      offset_value: Number(value),
                      offset_unit: unit as ReminderOffsetUnit,
                    })
                  }}
                  aria-label="За сколько до срока"
                  className="w-40"
                >
                  {/* A value set elsewhere (or by an older UI) must remain selectable. */}
                  {!knownPreset ? (
                    <option value={currentPreset}>
                      За {reminder.offset_value} {reminder.offset_unit === 'hours' ? 'ч' : 'мин'}
                    </option>
                  ) : null}
                  {OFFSET_PRESETS.map((preset) => (
                    <option key={presetKey(preset.value, preset.unit)} value={presetKey(preset.value, preset.unit)}>
                      {preset.label}
                    </option>
                  ))}
                </Select>

                <Badge variant={badge.variant}>{badge.text}</Badge>

                {reminder.last_error ? (
                  <span className="text-body-sm text-text-muted" title={reminder.last_error}>
                    {reminder.last_error}
                  </span>
                ) : null}

                <button
                  type="button"
                  onClick={() => removeReminder(index)}
                  aria-label="Удалить напоминание"
                  className="ml-auto text-text-muted transition hover:text-danger"
                >
                  <Trash2 className="size-4" aria-hidden />
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </SurfaceCard>
  )
}
