import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { Bell, BellOff, BellRing, Plus, X } from 'lucide-react'
import clsx from 'clsx'
import { Button, Select } from '@/components/ui'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { api } from '../../../api/client'
import { queryKeys } from '../../../api/queries/keys'
import type { CardDeadlineReminder, ReminderOffsetUnit } from '../../../api/types'
import { russianPlural } from '../lib/taskFormat'
import { PropertyButton, propertyPopoverClass } from './property'

interface RemindersPropertyProps {
  cardId: number
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

const FAILED_STATUSES = new Set(['skipped', 'failed', 'invalid.no_deadline', 'invalid.past', 'invalid.channel'])

/**
 * Status copy is deliberately blunt about failure. A reminder that silently
 * did not fire is the exact problem this control exists to make visible.
 */
function statusText(reminder: CardDeadlineReminder): string {
  switch (reminder.status) {
    case 'scheduled':
      return 'запланировано'
    case 'dispatched':
      return 'отправляется'
    case 'sent':
      return 'отправлено'
    case 'disabled':
      return 'выключено'
    case 'skipped':
      return 'пропущено'
    case 'failed':
      return 'ошибка отправки'
    case 'invalid.no_deadline':
      return 'нет срока'
    case 'invalid.past':
      return 'время уже прошло'
    case 'invalid.channel':
      return 'нет устройств'
    default:
      return reminder.status
  }
}

function presetKey(value: number, unit: ReminderOffsetUnit): string {
  return `${value}:${unit}`
}

function offsetLabel(value: number, unit: ReminderOffsetUnit): string {
  const preset = OFFSET_PRESETS.find((item) => item.value === value && item.unit === unit)
  if (preset) return preset.label
  return unit === 'hours'
    ? `За ${value} ${russianPlural(value, 'час', 'часа', 'часов')}`
    : `За ${value} ${russianPlural(value, 'минуту', 'минуты', 'минут')}`
}

export function RemindersProperty({ cardId }: RemindersPropertyProps) {
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
  const hasFailure = reminders.some((reminder) => reminder.enabled && FAILED_STATUSES.has(reminder.status))
  const active = reminders.filter((reminder) => reminder.enabled)

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

  const label =
    active.length === 0 || !active[0]
      ? 'Напоминание'
      : active.length === 1
        ? offsetLabel(active[0].offset_value, active[0].offset_unit)
        : `${active.length} ${russianPlural(active.length, 'напоминание', 'напоминания', 'напоминаний')}`

  return (
    <Popover>
      <PopoverTrigger asChild>
        <PropertyButton
          tone={hasFailure ? 'danger' : active.length > 0 ? 'set' : 'empty'}
          disabled={query.isLoading}
          aria-label={hasFailure ? `${label}: есть ошибка отправки` : label === 'Напоминание' ? 'Настроить напоминание' : `Напоминание: ${label}`}
        >
          <Bell aria-hidden="true" />
          {label}
        </PropertyButton>
      </PopoverTrigger>
      <PopoverContent align="start" className={`${propertyPopoverClass} w-80 p-3`}>
        {!pushAvailable ? (
          <div className="space-y-1.5 p-1 text-body-sm text-text-muted">
            <p className="font-medium text-text">Некуда отправлять</p>
            <p>Подключите устройство, чтобы получать напоминания.</p>
            {pushReason ? <p>{pushReason}</p> : null}
            <Link to="/settings" className="inline-block text-primary underline-offset-4 hover:underline">
              Включить уведомления в настройках
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {reminders.length > 0 ? (
              <ul className="space-y-1">
                {reminders.map((reminder, index) => {
                  const currentPreset = presetKey(reminder.offset_value, reminder.offset_unit)
                  const knownPreset = OFFSET_PRESETS.some((preset) => presetKey(preset.value, preset.unit) === currentPreset)
                  const failed = FAILED_STATUSES.has(reminder.status)
                  return (
                    <li key={reminder.id} className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => updateReminder(index, { enabled: !reminder.enabled })}
                        aria-label={reminder.enabled ? 'Выключить напоминание' : 'Включить напоминание'}
                        className="rounded-control p-1.5 text-text-muted transition hover:bg-surface-hover hover:text-text"
                      >
                        {reminder.enabled ? <BellRing className="h-4 w-4" aria-hidden="true" /> : <BellOff className="h-4 w-4" aria-hidden="true" />}
                      </button>
                      <div className="min-w-0 flex-1">
                        <Select
                          value={currentPreset}
                          onChange={(event) => {
                            const [value, unit] = event.target.value.split(':')
                            updateReminder(index, { offset_value: Number(value), offset_unit: unit as ReminderOffsetUnit })
                          }}
                          aria-label="За сколько до срока"
                          className="h-8"
                        >
                          {/* A value set elsewhere (or by an older UI) must remain selectable. */}
                          {!knownPreset ? (
                            <option value={currentPreset}>{offsetLabel(reminder.offset_value, reminder.offset_unit)}</option>
                          ) : null}
                          {OFFSET_PRESETS.map((preset) => (
                            <option key={presetKey(preset.value, preset.unit)} value={presetKey(preset.value, preset.unit)}>
                              {preset.label}
                            </option>
                          ))}
                        </Select>
                        <p
                          className={clsx('mt-0.5 truncate text-caption', failed ? 'text-danger' : 'text-text-muted')}
                          title={reminder.last_error || undefined}
                        >
                          {statusText(reminder)}
                          {reminder.last_error ? ` · ${reminder.last_error}` : ''}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeReminder(index)}
                        aria-label="Удалить напоминание"
                        className="self-start rounded-control p-1.5 text-text-muted transition hover:bg-surface-hover hover:text-danger"
                      >
                        <X className="h-4 w-4" aria-hidden="true" />
                      </button>
                    </li>
                  )
                })}
              </ul>
            ) : (
              <p className="px-1 text-body-sm text-text-muted">Пришлём уведомление до наступления срока.</p>
            )}
            <div className="flex items-center gap-2">
              <Select
                value={pendingOffset}
                onChange={(event) => setPendingOffset(event.target.value)}
                aria-label="Новое напоминание: за сколько до срока"
                className="h-8 flex-1"
              >
                {OFFSET_PRESETS.map((preset) => (
                  <option key={presetKey(preset.value, preset.unit)} value={presetKey(preset.value, preset.unit)}>
                    {preset.label}
                  </option>
                ))}
              </Select>
              <Button type="button" size="sm" onClick={addReminder} loading={save.isPending}>
                <Plus className="h-4 w-4" aria-hidden="true" />
                Добавить
              </Button>
            </div>
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}
