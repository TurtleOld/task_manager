import { useCallback, useEffect, useState } from 'react'
import { api } from '../../api/client'
import type { UserSessionInfo } from '../../api/types'
import { clearLocalSession } from '../../app/session'
import { Monitor } from 'lucide-react'
import { Button, Skeleton } from '@/components/ui'
import { SettingsSection, StatusDot } from './ui'
import { formatSessionDate, orderSessions } from './sessions'

/** Текущая сессия всегда первая (см. orderSessions), остальное — по запросу. */
const VISIBLE_SESSIONS = 5

interface SessionsSectionProps {
  onLogout: () => void
}

export function SessionsSection({ onLogout }: SessionsSectionProps) {
  const [sessions, setSessions] = useState<UserSessionInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [endingId, setEndingId] = useState<string | null>(null)
  const [terminatingAll, setTerminatingAll] = useState(false)
  const [showAll, setShowAll] = useState(false)

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
    <SettingsSection
      id="sessions"
      title="Сессии"
      description="Каждый вход — отдельная сессия. Завершайте всё, что не узнаёте."
      action={
        <Button type="button" variant="ghost" size="sm" onClick={() => void refresh()}>
          Обновить
        </Button>
      }
    >
      {loading ? (
        <div className="space-y-2 px-5 py-4">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : sessions.length === 0 ? (
        <p className="px-5 py-4 text-body-sm text-text-muted">Сессий нет. Обновите список.</p>
      ) : (
        sessions.slice(0, showAll ? undefined : VISIBLE_SESSIONS).map((session) => (
          <div key={session.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3.5">
            <Monitor className="h-4 w-4 shrink-0 text-text-muted" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
                <span className="truncate text-body-sm font-medium text-text">{session.label || 'Неизвестное устройство'}</span>
                {session.current ? <StatusDot tone="primary">это устройство</StatusDot> : null}
                {session.notifications_enabled ? <StatusDot tone="success">уведомления включены</StatusDot> : null}
              </div>
              <p className="text-caption font-normal text-text-muted">
                Вход {formatSessionDate(session.login_at)} · активность {formatSessionDate(session.last_activity)}
              </p>
            </div>
            {session.current ? (
              <Button type="button" variant="secondary" size="sm" onClick={() => void onLogout()}>
                Выйти
              </Button>
            ) : (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="hover:text-danger"
                loading={endingId === session.id}
                onClick={() => void onEnd(session)}
              >
                Завершить
              </Button>
            )}
          </div>
        ))
      )}
      {!loading && sessions.length > VISIBLE_SESSIONS ? (
        <button
          type="button"
          onClick={() => setShowAll((value) => !value)}
          className="block w-full px-5 py-3 text-left text-body-sm text-text-muted transition hover:bg-surface-hover hover:text-text"
        >
          {showAll ? 'Свернуть' : `Показать ещё ${sessions.length - VISIBLE_SESSIONS}`}
        </button>
      ) : null}
      <div className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center">
        <p className="flex-1 text-body-sm text-text-muted">Выйти везде, включая это устройство.</p>
        <Button type="button" variant="danger" size="sm" loading={terminatingAll} onClick={() => void onTerminateAll()}>
          Завершить все сеансы
        </Button>
      </div>
      {error ? (
        <p className="px-5 py-3 text-body-sm text-danger" role="alert">
          {error}
        </p>
      ) : null}
    </SettingsSection>
  )
}
