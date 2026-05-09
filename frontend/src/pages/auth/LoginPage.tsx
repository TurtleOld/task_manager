import { useEffect, useState } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { api } from '../../api/client'
import type { AuthUser, RegistrationStatus } from '../../api/types'
import { Badge, Button, Card as SurfaceCard, Field, PageShell, TextInput } from '../../shared/ui'

interface LoginPageProps {
  onLogin: (user: AuthUser) => void
  token: string | null
}

export function LoginPage({ onLogin, token }: LoginPageProps) {
  const navigate = useNavigate()
  const location = useLocation()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [registrationStatus, setRegistrationStatus] = useState<RegistrationStatus | null>(null)
  const [checkingRegistration, setCheckingRegistration] = useState(true)

  useEffect(() => {
    setCheckingRegistration(true)
    api
      .registrationStatus()
      .then((status) => setRegistrationStatus(status))
      .catch(() => setRegistrationStatus(null))
      .finally(() => setCheckingRegistration(false))
  }, [])

  if (token) {
    return <Navigate to="/" replace />
  }

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setError('')
    setLoading(true)
    try {
      const user = await api.login({ username: username.trim(), password })
      onLogin(user)
      const boards = await api.listBoards()
      if (boards.length === 1) {
        navigate(`/boards/${boards[0]?.id}`, { replace: true })
      } else {
        const next = (location.state as { from?: string } | null)?.from
        navigate(next || '/', { replace: true })
      }
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  const loginErrorId = error ? 'login-error' : undefined

  return (
    <PageShell width="2xl" padding="comfortable" spacing="none">
      <div className="grid min-h-[calc(100vh-6rem)] items-center gap-8 lg:grid-cols-[1.05fr_0.95fr]">
        <section className="space-y-6">
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="primary">Task Manager</Badge>
              <Badge variant="info">Productivity workspace</Badge>
            </div>
            <div>
              <h1 className="text-[clamp(2.5rem,6vw,4.5rem)] font-bold leading-[0.95] tracking-[-0.04em] text-text">
                Управляйте задачами
                <br />
                без визуального шума
              </h1>
              <p className="mt-4 max-w-2xl text-body text-text-muted">
                Единое пространство для досок, статусов, приоритетов, дедлайнов и командной работы в реальном времени.
              </p>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <SurfaceCard className="p-5">
              <p className="text-caption uppercase text-text-muted">Boards</p>
              <p className="mt-2 text-h3 text-text">Kanban flow</p>
            </SurfaceCard>
            <SurfaceCard className="p-5">
              <p className="text-caption uppercase text-text-muted">Realtime</p>
              <p className="mt-2 text-h3 text-text">Live updates</p>
            </SurfaceCard>
            <SurfaceCard className="p-5">
              <p className="text-caption uppercase text-text-muted">Alerts</p>
              <p className="mt-2 text-h3 text-text">Push-ready</p>
            </SurfaceCard>
          </div>
        </section>

        <SurfaceCard as="form" onSubmit={onSubmit} className="space-y-6 border-primary/10 p-7 shadow-elevated">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Badge variant="primary">Sign in</Badge>
              <Badge variant="neutral">Secure access</Badge>
            </div>
            <h2 className="text-h2 text-text">Вход в рабочее пространство</h2>
            <p className="text-body-sm text-text-muted">Введите логин и пароль, чтобы открыть ваши доски и задачи.</p>
          </div>

          <div className="space-y-4">
            <Field label="Логин" htmlFor="login-username">
              <TextInput id="login-username" value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" aria-describedby={loginErrorId} invalid={Boolean(error)} />
            </Field>
            <Field label="Пароль" htmlFor="login-password">
              <TextInput id="login-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" aria-describedby={loginErrorId} invalid={Boolean(error)} />
            </Field>
            {error ? <p id="login-error" className="rounded-panel border border-danger/25 bg-danger/10 px-4 py-3 text-body-sm text-danger">{error}</p> : null}
          </div>

          <div className="flex flex-col gap-3">
            <Button type="submit" loading={loading} fullWidth>Войти</Button>
            {!checkingRegistration && registrationStatus?.allow_first ? (
              <div className="text-center text-body-sm text-text-muted">
                Первый вход?{' '}
                <Link to="/register" className="font-semibold text-primary hover:text-primary-hover">Зарегистрироваться</Link>
              </div>
            ) : null}
          </div>
        </SurfaceCard>
      </div>
    </PageShell>
  )
}
