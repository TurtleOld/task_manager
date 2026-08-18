import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { BellOff, BellRing, Send } from 'lucide-react'
import { api } from '../../api/client'
import type { PushDevice, PushTestResponse } from '../../api/types'
import { enableNotifications, getNotificationPermission, hasActiveSubscription } from '../../lib/pushManager'
import { Badge, Button, Card as SurfaceCard, EmptyState, Skeleton } from '@/components/ui'

function formatDate(value: string | null): string {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleString('ru-RU')
}

export function NotificationsSection() {
  const [devices, setDevices] = useState<PushDevice[]>([])
  const [loading, setLoading] = useState(true)
  const [enabled, setEnabled] = useState(false)
  const [enabling, setEnabling] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<PushTestResponse | null>(null)
  const [error, setError] = useState('')

  const refresh = useCallback(async () => {
    setError('')
    try {
      const [nextDevices, active] = await Promise.all([
        api.listPushDevices(),
        hasActiveSubscription(),
      ])
      setDevices(nextDevices)
      setEnabled(active)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

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

  const onDisable = async (device: PushDevice) => {
    setError('')
    try {
      await api.deletePushDevice(device.id)
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

  const permission = getNotificationPermission()

  return (
    <SurfaceCard as="section" className="space-y-5 compact:space-y-4">
      <div>
        <div className="flex items-center gap-2">
          <Badge variant="info">Уведомления</Badge>
          <Badge variant="neutral">Web Push</Badge>
        </div>
        <h2 className="mt-3 text-h3 text-text">Уведомления</h2>
        <p className="mt-1 text-body-sm text-text-muted">
          Уведомления приходят на телефон и часы, даже когда вкладка закрыта.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" onClick={() => void onEnable()} loading={enabling} disabled={enabled}>
          {enabled ? <BellRing className="size-4" aria-hidden /> : <BellOff className="size-4" aria-hidden />}
          {enabled ? 'Уведомления включены' : 'Включить уведомления'}
        </Button>
        {permission === 'denied' ? (
          <p className="text-body-sm text-warning">
            Уведомления заблокированы для этого сайта. Разрешите их в настройках браузера.
          </p>
        ) : null}
      </div>

      <div className="rounded-[1.15rem] border border-border/75 bg-background-subtle/55 p-4 shadow-surface compact:p-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-body-sm font-semibold text-text">Подключённые устройства</p>
            <p className="mt-1 text-caption text-text-muted">
              Новое устройство не отключает предыдущие. Последняя ошибка видна рядом с каждым.
            </p>
          </div>
          <Button type="button" variant="secondary" size="sm" onClick={() => void refresh()}>Обновить</Button>
        </div>

        {loading ? (
          <div className="mt-4 space-y-2">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : devices.length === 0 ? (
          <EmptyState title="Устройств нет" className="mt-4 p-4">
            Нажмите «Включить уведомления», чтобы подключить этот браузер.
          </EmptyState>
        ) : (
          <ul className="mt-4 space-y-2">
            {devices.map((device) => (
              <li key={device.id} className="flex flex-wrap items-center gap-3 rounded-[1.15rem] border border-border/75 bg-surface/90 px-4 py-3 shadow-surface">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-semibold text-text">{device.label || `Устройство #${device.id}`}</span>
                    {device.active ? <Badge variant="success">Активно</Badge> : <Badge variant="neutral">Отключено</Badge>}
                  </div>
                  <p className="mt-1 text-caption text-text-muted">
                    Последняя доставка: {formatDate(device.last_success_at)}
                  </p>
                  {device.last_error ? (
                    <p className="mt-1 text-caption text-danger" title={device.last_error}>
                      {device.last_error}
                    </p>
                  ) : null}
                </div>
                <Button type="button" variant="danger" size="sm" onClick={() => void onDisable(device)}>
                  Отключить
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="secondary" onClick={() => void onTest()} loading={testing}>
          <Send className="size-4" aria-hidden />
          Отправить тестовое уведомление
        </Button>
        {testResult ? (
          <span className={`text-body-sm ${testResult.delivered ? 'text-success' : 'text-danger'}`}>
            {testResult.delivered ? 'Дошло' : testResult.no_devices ? 'Нет устройств' : testResult.detail}
          </span>
        ) : null}
      </div>

      {error ? <p className="text-body-sm text-danger" role="alert">{error}</p> : null}
    </SurfaceCard>
  )
}
