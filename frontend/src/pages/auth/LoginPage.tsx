import { useEffect, useState } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { api } from '../../api/client'
import type { AuthUser, RegistrationStatus } from '../../api/types'
import { Button, Card as SurfaceCard, Field, PageShell, TextInput } from '../../shared/ui'

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
    <PageShell width="md" padding="comfortable" spacing="sm">
      <header className="space-y-2 text-center">
        <p className="text-label uppercase text-primary">Task Manager</p>
        <h1 className="text-h1 text-text">Вход</h1>
        <p className="text-body-sm text-text-muted">Войдите, чтобы увидеть ваши доски.</p>
      </header>

      <SurfaceCard as="form" onSubmit={onSubmit}>
        <div className="space-y-4">
          <Field label="Логин" htmlFor="login-username">
            <TextInput
              id="login-username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              aria-describedby={loginErrorId}
              invalid={Boolean(error)}
            />
          </Field>
          <Field label="Пароль" htmlFor="login-password">
            <TextInput
              id="login-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              aria-describedby={loginErrorId}
              invalid={Boolean(error)}
            />
          </Field>
          {error ? <p id="login-error" className="text-body-sm text-danger">{error}</p> : null}
          <Button type="submit" loading={loading} fullWidth>
            Войти
          </Button>
        </div>
      </SurfaceCard>

      {!checkingRegistration && registrationStatus?.allow_first ? (
        <div className="text-center text-body-sm text-text-muted">
          Первый вход?{' '}
          <Link to="/register" className="font-semibold text-primary hover:text-primary-hover">
            Зарегистрироваться
          </Link>
        </div>
      ) : null}
    </PageShell>
  )
}
