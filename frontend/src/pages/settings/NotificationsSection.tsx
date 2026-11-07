import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { BellRing, RefreshCw, Send, Smartphone } from 'lucide-react'
import { api } from '../../api/client'
import type {
  NotificationProfile,
  PushDevice,
  PushTestResponse,
  TelegramStatus,
} from '../../api/types'
import {
  disableCurrentDevice,
  enableNotifications,
  getNotificationPermission,
  getSavedDeviceId,
  hasActiveSubscription,
  resubscribe,
} from '../../lib/pushManager'
import { Button, Select, Skeleton } from '@/components/ui'
import { SettingsRow, SettingsSection, StatusDot } from './ui'

function formatDate(value: string | null): string {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleString('ru-RU')
}

export function NotificationsSection({ telegramStatus }: { telegramStatus: TelegramStatus | null }) {
  const [devices, setDevices] = useState<PushDevice[]>([])
  const [profile, setProfile] = useState<NotificationProfile | null>(null)
  const [channelSaving, setChannelSaving] = useState(false)
  const [loading, setLoading] = useState(true)
  const [enabled, setEnabled] = useState(false)
  const [enabling, setEnabling] = useState(false)
  const [resubscribing, setResubscribing] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<PushTestResponse | null>(null)
  const [error, setError] = useState('')

  const refresh = useCallback(async () => {
    setError('')
    try {
      const [nextDevices, nextProfile, active] = await Promise.all([
        api.listPushDevices(),
        api.getNotificationProfile(),
        hasActiveSubscription(),
      ])
      const savedId = getSavedDeviceId()
      setDevices(nextDevices)
      setProfile(nextProfile)
      // The button must reflect the server, not just the local browser: a
      // device disabled elsewhere stays subscribed locally but no longer
      // receives anything, so the browser must be allowed to re-register.
      setEnabled(
        active && savedId !== null && nextDevices.some((d) => d.id === savedId && d.active),
      )
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  // Unlink falls back to Push server-side, so a link-status change must
  // re-read the profile to keep the channel selector in sync.
  const linkedRef = useRef<boolean | null>(null)
  useEffect(() => {
    const linked = telegramStatus?.linked ?? false
    if (linkedRef.current !== null && linkedRef.current !== linked) {
      void refresh()
    }
    linkedRef.current = linked
  }, [telegramStatus?.linked, refresh])

  const onEnable = async () => {
    setEnabling(true)
    setError('')
    try {
      await enableNotifications()
      toast.success('Уведомления включены')
      await refresh()
    } catch (e) {
      setError((e as Error).message)
      toast.error('Не удалось включить уведомления')
    } finally {
      setEnabling(false)
    }
  }

  const onResubscribe = async () => {
    setResubscribing(true)
    setError('')
    try {
      await resubscribe()
      toast.success('Подписка обновлена')
      await refresh()
    } catch (e) {
      setError((e as Error).message)
      toast.error('Не удалось обновить подписку')
    } finally {
      setResubscribing(false)
    }
  }

  const onDisable = async (device: PushDevice) => {
    setError('')
    try {
      if (device.id === getSavedDeviceId()) {
        await disableCurrentDevice()
      } else {
        await api.deletePushDevice(device.id)
      }
      await refresh()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  const onTest = async () => {
    setTesting(true)
    setTestResult(null)
    setError('')
    try {
      const result = await api.testPushDevice()
      setTestResult(result)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setTesting(false)
    }
  }

  const onChangeChannel = async (value: string) => {
    if (!profile || channelSaving) return
    const next = value as NotificationProfile['delivery_channel']
    if (next === profile.delivery_channel) return
    setChannelSaving(true)
    setError('')
    const previous = profile
    setProfile({ ...profile, delivery_channel: next })
    try {
      setProfile(await api.updateNotificationProfile({ delivery_channel: next }))
      toast.success('Канал доставки обновлён')
    } catch (e) {
      setProfile(previous)
      setError((e as Error).message)
      toast.error('Не удалось изменить канал доставки')
    } finally {
      setChannelSaving(false)
    }
  }

  const permission = getNotificationPermission()

  const channel = profile?.delivery_channel ?? 'push'
  const pushOn = channel === 'push'
  const telegramOn = channel === 'telegram'
  const telegramLinked = telegramStatus?.linked ?? false

  return (
    <SettingsSection
      id="notifications"
      title="Уведомления"
      description="Приходят на телефон и часы, даже когда вкладка закрыта."
    >
      <SettingsRow
        label="Канал доставки"
        description={
          telegramOn
            ? 'События и напоминания приходят в ваш личный чат Telegram. Смена канала отменяет ожидающую отправку прежнего; уже начавшаяся может дойти и после смены.'
            : pushOn
              ? 'События и напоминания доставляются на все ваши устройства. Выключение действует сразу везде; уже начавшаяся отправка может дойти и после выключения.'
              : 'Внешняя доставка выключена — события и напоминания остаются только во Входящих. Подписки устройств сохраняются, включение вернёт их без повторной рассылки старого.'
        }
        htmlFor="delivery-channel"
      >
        <Select
          id="delivery-channel"
          value={channel}
          onChange={(e) => void onChangeChannel(e.target.value)}
          disabled={profile === null || channelSaving}
          className="sm:w-52"
        >
          <option value="push">Push</option>
          <option value="telegram" disabled={!telegramLinked}>
            Telegram{telegramLinked ? '' : ' (подключите)'}
          </option>
          <option value="disabled">Выключено</option>
        </Select>
      </SettingsRow>

      {pushOn && devices.length === 0 && !loading ? (
        <SettingsRow label="Устройства для доставки" description="Подключённых устройств нет — включите уведомления в этом браузере ниже, иначе доставлять некуда." />
      ) : null}

      <SettingsRow
        label="Этот браузер"
        description={
          permission === 'denied' ? (
            <span className="text-warning">Уведомления заблокированы для сайта. Разрешите их в настройках браузера.</span>
          ) : enabled ? (
            'Получает уведомления. Если они перестали приходить, обновите подписку: Android иногда незаметно для сервера роняет старую.'
          ) : (
            'Подключите, чтобы получать напоминания о сроках.'
          )
        }
      >
        {enabled ? (
          <Button type="button" variant="secondary" size="sm" onClick={() => void onResubscribe()} loading={resubscribing}>
            <RefreshCw className="size-4" aria-hidden />
            Обновить подписку
          </Button>
        ) : (
          <Button type="button" size="sm" onClick={() => void onEnable()} loading={enabling}>
            <BellRing className="size-4" aria-hidden />
            Включить уведомления
          </Button>
        )}
      </SettingsRow>

      <SettingsRow
        label="Подключённые устройства"
        description="Новое устройство не отключает предыдущие."
        stacked
      >
        {loading ? (
          <div className="space-y-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : devices.length === 0 ? (
          <p className="text-body-sm text-text-muted">Пока ни одного устройства.</p>
        ) : (
          <ul className="-mx-2">
            {devices.map((device) => (
              <li key={device.id} className="group flex items-center gap-3 rounded-control px-2 py-2 transition-colors hover:bg-surface-hover">
                <Smartphone className="h-4 w-4 shrink-0 text-text-muted" aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
                    <span className="truncate text-body-sm text-text">{device.label || `Устройство #${device.id}`}</span>
                    {device.active ? <StatusDot tone="success">активно</StatusDot> : <StatusDot tone="muted">отключено</StatusDot>}
                  </div>
                  <p className="text-caption font-normal text-text-muted">
                    Последняя доставка: {formatDate(device.last_success_at)}
                  </p>
                  {device.last_error ? (
                    <p className="truncate text-caption font-normal text-danger" title={device.last_error}>
                      {device.last_error}
                    </p>
                  ) : null}
                </div>
                <Button type="button" variant="ghost" size="sm" onClick={() => void onDisable(device)} className="hover:text-danger">
                  Отключить
                </Button>
              </li>
            ))}
          </ul>
        )}
      </SettingsRow>

      <SettingsRow
        label="Проверка доставки"
        description={
          testResult ? (
            <span className={testResult.delivered ? 'text-success' : 'text-danger'}>
              {testResult.delivered ? 'Дошло.' : testResult.no_devices ? 'Нет устройств.' : testResult.detail}
            </span>
          ) : (
            'Отправит тестовое уведомление на все ваши устройства.'
          )
        }
      >
        <div className="flex gap-1">
          <Button type="button" variant="ghost" size="sm" onClick={() => void refresh()} aria-label="Обновить список устройств" title="Обновить список">
            <RefreshCw className="size-4" aria-hidden />
          </Button>
          <Button type="button" variant="secondary" size="sm" onClick={() => void onTest()} loading={testing}>
            <Send className="size-4" aria-hidden />
            Отправить тест
          </Button>
        </div>
      </SettingsRow>

      {error ? (
        <p className="px-5 py-3 text-body-sm text-danger" role="alert">
          {error}
        </p>
      ) : null}
    </SettingsSection>
  )
}
