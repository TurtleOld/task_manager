import { Label as RadixLabel } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { cn } from '@/lib/utils'
import { Badge, Button, Card as SurfaceCard, Checkbox, Select, Skeleton, TextInput } from '@/components/ui'
import type { RemindersSectionProps } from '../TaskModal.types'

export function RemindersSection({
  draft,
  reminderDrafts,
  reminderData,
  reminderLoading,
  reminderError,
  reminderFieldError,
  newReminderValue,
  setNewReminderValue,
  newReminderUnit,
  setNewReminderUnit,
  applyReminderValue,
  applyReminderUnit,
  applyReminderChannel,
  toggleReminder,
  addReminderInterval,
  removeReminderInterval,
}: RemindersSectionProps) {
  const enabledReminderCount = reminderDrafts.filter((item) => item.enabled).length
  const hasDeadline = Boolean(reminderData?.deadline || draft.deadline)

  return (
    <SurfaceCard as="section" className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Badge variant="warning">Reminder</Badge>
            <Badge variant={enabledReminderCount > 0 ? 'primary' : 'neutral'}>Активно: {enabledReminderCount}</Badge>
          </div>
          <h3 className="mt-3 text-h3 text-text">Напоминания о дедлайне</h3>
          <p className="mt-1 text-body-sm text-text-muted">Настройте интервалы и канал отправки перед сроком выполнения.</p>
        </div>
        <Checkbox
          label="Включено"
          checked={reminderDrafts.some((item) => item.enabled)}
          onChange={(event) => {
            const nextEnabled = event.target.checked
            reminderDrafts.forEach((item) => toggleReminder(item.id, nextEnabled))
          }}
          disabled={!hasDeadline || reminderDrafts.length === 0}
          className="bg-background-subtle/50"
        />
      </div>

      {reminderLoading ? <ReminderSettingsSkeleton /> : null}
      {reminderError ? <p className="text-caption text-danger" role="alert">{reminderError}</p> : null}
      {!hasDeadline ? (
        <div className="rounded-panel border border-dashed border-warning/35 bg-warning/10 px-4 py-3 text-caption text-warning">
          Установите срок выполнения, чтобы настроить напоминание.
        </div>
      ) : null}
      {reminderDrafts.length === 0 && hasDeadline ? (
        <div className="rounded-panel border border-dashed border-border bg-background-subtle/55 px-4 py-3 text-caption text-text-muted">
          Добавьте один или несколько интервалов напоминания.
        </div>
      ) : null}

      {reminderDrafts.length > 0 && hasDeadline ? (
        <div className="space-y-4">
          <div className="space-y-3">
            <p className="text-label uppercase text-text-muted">Интервалы до дедлайна</p>
            {reminderDrafts.map((item) => (
              <div key={item.id} className="flex flex-wrap items-center gap-2 rounded-panel border border-border/70 bg-background-subtle/55 p-3">
                <TextInput
                  type="number"
                  min={1}
                  max={item.offset_unit === 'hours' ? 168 : 1440}
                  step={1}
                  value={item.offset_value}
                  onChange={(event) => {
                    const next = Number(event.target.value)
                    if (!Number.isFinite(next) || !Number.isInteger(next) || next <= 0) return
                    if (next > (item.offset_unit === 'hours' ? 168 : 1440)) return
                    applyReminderValue(item.id, next)
                  }}
                  fullWidth={false}
                  className="w-24"
                  disabled={!item.enabled}
                />
                <Select value={item.offset_unit} onChange={(event) => applyReminderUnit(item.id, event.target.value as 'minutes' | 'hours')} fullWidth={false} className="w-28" disabled={!item.enabled}>
                  <option value="minutes">минут</option>
                  <option value="hours">часов</option>
                </Select>
                <Checkbox label="Активно" checked={item.enabled} onChange={(event) => toggleReminder(item.id, event.target.checked)} className="border-transparent bg-transparent px-2 shadow-none" />
                <Button type="button" variant="danger" size="sm" onClick={() => removeReminderInterval(item.id)}>Удалить</Button>
              </div>
            ))}
            <div className="flex flex-wrap items-center gap-2 rounded-panel border border-dashed border-border bg-background-subtle/55 p-3">
              <TextInput type="number" min={1} max={newReminderUnit === 'hours' ? 168 : 1440} step={1} value={newReminderValue} onChange={(event) => setNewReminderValue(Number(event.target.value) || 1)} fullWidth={false} className="w-24" />
              <Select value={newReminderUnit} onChange={(event) => setNewReminderUnit(event.target.value as 'minutes' | 'hours')} fullWidth={false} className="w-28">
                <option value="minutes">минут</option>
                <option value="hours">часов</option>
              </Select>
              <Button type="button" onClick={() => addReminderInterval(newReminderValue, newReminderUnit)} disabled={!hasDeadline} variant="secondary" size="sm">Добавить интервал</Button>
            </div>
            <p className="text-caption text-text-muted">Изменения сохраняются вместе с общей кнопкой «Сохранить».</p>
          </div>

          <ReminderChannelPicker
            reminderDrafts={reminderDrafts}
            reminderData={reminderData}
            reminderFieldError={reminderFieldError}
            applyReminderChannel={applyReminderChannel}
          />

          {reminderDrafts.some((item) => item.status === 'invalid.past') ? (
            <div className="rounded-panel border border-warning/30 bg-warning/10 px-4 py-3 text-caption text-warning">Время напоминания уже прошло. Скорректируйте интервал или срок выполнения.</div>
          ) : null}
          {reminderDrafts.some((item) => item.status === 'invalid.channel') ? (
            <div className="rounded-panel border border-danger/30 bg-danger/10 px-4 py-3 text-caption text-danger">Канал доставки недоступен. Проверьте настройки уведомлений.</div>
          ) : null}
        </div>
      ) : null}
    </SurfaceCard>
  )
}

function ReminderChannelPicker({ reminderDrafts, reminderData, reminderFieldError, applyReminderChannel }: Pick<RemindersSectionProps, 'reminderDrafts' | 'reminderData' | 'reminderFieldError' | 'applyReminderChannel'>) {
  const availableCount = reminderData?.channels ? Object.values(reminderData.channels).filter((channel) => channel.available).length : 0
  const autoChannel = availableCount === 1 ? (['email', 'telegram', 'push'] as const).find((channel) => reminderData?.channels?.[channel]?.available) : undefined
  const value = reminderDrafts.every((item) => item.channel === 'email') || (reminderDrafts.every((item) => item.channel === null) && autoChannel === 'email')
    ? 'email'
    : reminderDrafts.every((item) => item.channel === 'telegram') || (reminderDrafts.every((item) => item.channel === null) && autoChannel === 'telegram')
      ? 'telegram'
      : reminderDrafts.every((item) => item.channel === 'push') || (reminderDrafts.every((item) => item.channel === null) && autoChannel === 'push')
        ? 'push'
      : undefined

  return (
    <div className="rounded-panel border border-border/70 bg-background-subtle/55 p-4 text-caption text-text-muted">
      <p className="font-semibold text-text">Канал доставки</p>
      <RadioGroup className="mt-3 grid gap-2" value={value} onValueChange={(next) => applyReminderChannel(next as 'email' | 'telegram' | 'push')}>
        {(['email', 'telegram', 'push'] as const).map((channel) => {
          const info = reminderData?.channels?.[channel]
          const available = info?.available ?? false
          const isOnlyAvailable = availableCount === 1
          const isAuto = reminderDrafts.every((item) => item.channel === null) && isOnlyAvailable && available
          const checked = reminderDrafts.every((item) => item.channel === channel) || isAuto
          const description = !available ? info?.reason || 'Недоступен' : isAuto ? 'Единственный доступный канал' : undefined
          return (
            <RadixLabel
              key={channel}
              htmlFor={`reminder-channel-${channel}`}
              className={cn(
                'flex cursor-pointer items-start gap-3 rounded-control border px-3.5 py-3 text-body-sm backdrop-blur transition duration-fast ease-standard',
                checked ? 'border-primary/35 bg-primary/10 text-text shadow-surface' : 'border-border bg-surface/90 text-text',
                !available ? 'cursor-not-allowed border-danger/25 bg-danger/10 opacity-60' : 'hover:border-primary/30 hover:bg-surface-hover',
              )}
            >
              <RadioGroupItem id={`reminder-channel-${channel}`} value={channel} disabled={!available} className="mt-0.5" />
              <span>
                <span className="block font-semibold">{channel === 'email' ? 'Email' : channel === 'telegram' ? 'Telegram' : 'Push'}</span>
                {description ? <span className="mt-1 block text-caption text-text-muted">{description}</span> : null}
              </span>
            </RadixLabel>
          )
        })}
      </RadioGroup>
      {reminderFieldError ? <p className="mt-3 text-caption text-danger" role="alert">{reminderFieldError}</p> : null}
    </div>
  )
}

function ReminderSettingsSkeleton() {
  return (
    <div className="space-y-3" aria-busy="true" aria-label="Загрузка настроек напоминаний">
      <Skeleton className="h-4 w-44" />
      <div className="rounded-panel border border-border/70 bg-background-subtle/55 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <Skeleton className="h-10 w-24 rounded-control" />
          <Skeleton className="h-10 w-28 rounded-control" />
          <Skeleton className="h-10 w-36 rounded-control" />
          <Skeleton className="h-9 w-20 rounded-control" />
        </div>
      </div>
    </div>
  )
}
