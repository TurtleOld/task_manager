import { useCallback, useEffect, useState } from 'react'
import { api } from '../../api/client'
import type { UserSessionInfo } from '../../api/types'
import { clearLocalSession } from '../../app/session'
import { Badge, Button, Card as SurfaceCard, EmptyState, Skeleton } from '@/components/ui'
import { formatSessionDate, orderSessions } from './sessions'

interface SessionsSectionProps {
  onLogout: () => void
}

export function SessionsSection({ onLogout }: SessionsSectionProps) {
  const [sessions, setSessions] = useState<UserSessionInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [endingId, setEndingId] = useState<string | null>(null)
  const [terminatingAll, setTerminatingAll] = useState(false)

  const refresh = useCallback(async () => {
    setError('')
    try {
      setSessions(orderSessions(await api.listSessions()))
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const onEnd = async (session: UserSessionInfo) => {
    setEndingId(session.id)
    setError('')
    try {
      await api.endSession(session.id)
      setSessions((prev) => prev.filter((item) => item.id !== session.id))
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setEndingId(null)
    }
  }

  const onTerminateAll = async () => {
    setTerminatingAll(true)
    try {
      await api.terminateSessions()
    } catch {
      // The local cleanup below must run even offline.
    } finally {
      await clearLocalSession()
    }
  }

  return (
    <SurfaceCard as="section" className="space-y-5 compact:space-y-4">
      <div>
        <div className="flex items-center gap-2">
          <Badge variant="success">Безопасность</Badge>
          <Badge variant="neutral">Активные входы</Badge>
        </div>
        <h2 className="mt-3 text-h3 text-text">Сессии</h2>
        <p className="mt-1 text-body-sm text-text-muted">
          Каждый вход — отдельная сессия. Завершайте всё, что не узнаёте.
        </p>
      </div>

      {loading ? (
        <div className="space-y-2">
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
        </div>
      ) : sessions.length === 0 ? (
        <EmptyState title="Сессий нет" className="p-4">Обновите страницу, чтобы загрузить входы.</EmptyState>
      ) : (
        <ul className="space-y-2">
          {sessions.map((session) => (
            <li
              key={session.id}
              className="flex flex-wrap items-center gap-3 rounded-[1.15rem] border border-border/75 bg-surface/90 px-4 py-3 shadow-surface"
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="truncate font-semibold text-text">
                    {session.label || 'Неизвестное устройство'}
                  </span>
                  {session.current ? <Badge variant="primary">Это устройство</Badge> : null}
                  {session.notifications_enabled ? (
                    <Badge variant="success">Уведомления включены</Badge>
                  ) : (
                    <Badge variant="neutral">Уведомления выключены</Badge>
                  )}
                </div>
                <p className="mt-1 text-caption text-text-muted">
                  Вход: {formatSessionDate(session.login_at)} · Последняя активность:{' '}
                  {formatSessionDate(session.last_activity)}
                </p>
              </div>
              {session.current ? (
                <Button type="button" variant="secondary" size="sm" onClick={() => void onLogout()}>
                  Выйти
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="danger"
                  size="sm"
                  loading={endingId === session.id}
                  onClick={() => void onEnd(session)}
                >
                  Завершить
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="secondary" size="sm" onClick={() => void refresh()}>
          Обновить
        </Button>
        <Button
          type="button"
          variant="danger"
          size="sm"
          loading={terminatingAll}
          onClick={() => void onTerminateAll()}
        >
          Завершить все сеансы
        </Button>
      </div>

      {error ? <p className="text-body-sm text-danger" role="alert">{error}</p> : null}
    </SurfaceCard>
  )
}
