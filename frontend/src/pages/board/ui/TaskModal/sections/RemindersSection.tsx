import { Badge, Button, Card as SurfaceCard, Checkbox, Select, Skeleton, TextInput } from '@/components/ui'
import type { RemindersSectionProps } from '../TaskModal.types'

export function RemindersSection({
  draft,
  reminderDrafts,
  reminderData,
  reminderLoading,
  reminderError,
  newReminderValue,
  setNewReminderValue,
  newReminderUnit,
  setNewReminderUnit,
  applyReminderValue,
  applyReminderUnit,
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
          <p className="mt-1 text-body-sm text-text-muted">Настройте интервалы push-уведомлений перед сроком выполнения.</p>
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
      {hasDeadline ? (
        <div className="space-y-4">
          <div className="space-y-3">
            {reminderDrafts.length > 0 ? <p className="text-label uppercase text-text-muted">Интервалы до дедлайна</p> : null}
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

          {reminderDrafts.some((item) => item.status === 'invalid.past') ? (
            <div className="rounded-panel border border-warning/30 bg-warning/10 px-4 py-3 text-caption text-warning">Время напоминания уже прошло. Скорректируйте интервал или срок выполнения.</div>
          ) : null}
          {reminderDrafts.some((item) => item.status === 'invalid.channel') ? (
            <div className="rounded-panel border border-danger/30 bg-danger/10 px-4 py-3 text-caption text-danger">Push-уведомления не настроены на этом устройстве. Проверьте разрешения на уведомления в браузере.</div>
          ) : null}
        </div>
      ) : null}
    </SurfaceCard>
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
