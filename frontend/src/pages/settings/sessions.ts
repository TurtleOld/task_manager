import type { UserSessionInfo } from '../../api/types'

export function orderSessions(sessions: UserSessionInfo[]): UserSessionInfo[] {
  return [...sessions].sort((a, b) => {
    if (a.current !== b.current) return a.current ? -1 : 1
    return b.login_at.localeCompare(a.login_at)
  })
}

export function formatSessionDate(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleDateString('ru-RU')
}
