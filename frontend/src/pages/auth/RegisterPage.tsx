import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { toggleTheme } from '../../app/theme'
import { api } from '../../api/client'
import type { AuthUser, PermissionKey, RegistrationStatus, UserRole } from '../../api/types'
import { permissionCatalog } from '../../shared/lib/permissions'
import { Badge, Button, Card as SurfaceCard, ErrorState, Field, Modal, PageShell, Select, TextInput } from '../../shared/ui'

interface RegisterPageProps {
  user: AuthUser | null
}

export function RegisterPage({ user }: RegisterPageProps) {
  const navigate = useNavigate()
  const [status, setStatus] = useState<RegistrationStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [role, setRole] = useState<UserRole>('viewer')
  const [permissions, setPermissions] = useState<PermissionKey[]>([])
  const [useCustomPermissions, setUseCustomPermissions] = useState(false)
  const [error, setError] = useState('')
  const [successMessage, setSuccessMessage] = useState('')
  const [saving, setSaving] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [formErrors, setFormErrors] = useState<Record<string, string>>({})

  useEffect(() => {
    api.registrationStatus().then((data) => setStatus(data)).catch(() => setStatus(null)).finally(() => setLoading(false))
  }, [])

  if (loading) {
    return <div className="p-6 text-text-muted">Loading...</div>
  }

  const allow = Boolean(status?.allow_first || status?.allow_admin)
  if (!allow) {
    return (
      <PageShell width="lg" padding="comfortable" spacing="sm">
        <ErrorState title="Регистрация недоступна" action={{ label: user ? 'Вернуться в настройки' : 'Ко входу', onClick: () => navigate(user ? '/settings' : '/login') }}>
          Регистрация возможна только при пустой базе или через администратора.
        </ErrorState>
      </PageShell>
    )
  }

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setError('')
    setSuccessMessage('')
    const trimmedUsername = username.trim()
    const trimmedName = fullName.trim()
    const nextErrors: Record<string, string> = {}
    if (!trimmedName) nextErrors.fullName = 'Введите имя'
    if (!trimmedUsername || trimmedUsername.length < 3) nextErrors.username = 'Минимум 3 символа'
    if (!password || password.length < 8) nextErrors.password = 'Минимум 8 символов'
    if (!role) nextErrors.role = 'Выберите роль'
    if (useCustomPermissions && permissions.length === 0) nextErrors.permissions = 'Выберите хотя бы одно право'
    setFormErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) return
    if (!confirmOpen) {
      setConfirmOpen(true)
      return
    }
    setSaving(true)
    try {
      await api.register({ username: trimmedUsername, password, full_name: trimmedName, role, permissions: useCustomPermissions ? permissions : undefined })
      setConfirmOpen(false)
      setSuccessMessage('Пользователь успешно создан. Можно добавить следующего.')
      setUsername('')
      setPassword('')
      setFullName('')
      setRole('viewer')
      setPermissions([])
      setUseCustomPermissions(false)
      if (status?.allow_first) navigate('/login', { replace: true })
      else navigate('/settings', { replace: true })
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <PageShell width="2xl" padding="comfortable" spacing="md">
      <header className="rounded-[1.6rem] border border-border/80 bg-[image:var(--gradient-surface)] px-6 py-6 shadow-elevated backdrop-blur">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="primary">User onboarding</Badge>
              <Badge variant="success">Access setup</Badge>
            </div>
            <div>
              <h1 className="text-h1 text-text">Создание пользователя</h1>
              <p className="mt-2 max-w-3xl text-body-sm text-text-muted">Заполните карточку доступа, выберите роль и при необходимости настройте права вручную.</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link to={status?.allow_first ? '/login' : '/settings'} className="inline-flex min-h-11 items-center gap-2 rounded-control border border-border bg-surface/90 px-4 py-2 text-button text-text shadow-surface backdrop-blur transition duration-fast ease-standard hover:border-border-strong hover:bg-surface-hover">Назад</Link>
            <Button type="button" variant="secondary" onClick={toggleTheme}>Тема</Button>
          </div>
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-[1.18fr_0.82fr]">
        <SurfaceCard as="form" onSubmit={onSubmit} className="space-y-6 border-primary/10 shadow-elevated">
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <Badge variant="primary">Account</Badge>
                  <Badge variant="neutral">Identity</Badge>
                </div>
                <h2 className="mt-3 text-h3 text-text">Данные учетной записи</h2>
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Имя и фамилия" htmlFor="register-full-name" error={formErrors.fullName} errorId="register-full-name-error">
                <TextInput id="register-full-name" value={fullName} onChange={(e) => setFullName(e.target.value)} autoComplete="name" invalid={Boolean(formErrors.fullName)} aria-describedby={formErrors.fullName ? 'register-full-name-error' : undefined} />
              </Field>
              <Field label="Логин" htmlFor="register-username" error={formErrors.username} errorId="register-username-error">
                <TextInput id="register-username" value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" invalid={Boolean(formErrors.username)} aria-describedby={formErrors.username ? 'register-username-error' : undefined} />
              </Field>
              <Field className="sm:col-span-2" label="Пароль" htmlFor="register-password" error={formErrors.password} errorId="register-password-error">
                <TextInput id="register-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" invalid={Boolean(formErrors.password)} aria-describedby={formErrors.password ? 'register-password-error' : undefined} />
              </Field>
            </div>
          </section>

          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <Badge variant="success">Permissions</Badge>
                  <Badge variant="neutral">Security</Badge>
                </div>
                <h2 className="mt-3 text-h3 text-text">Роли и доступ</h2>
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Роль" htmlFor="register-role" error={formErrors.role} errorId="register-role-error">
                <Select id="register-role" value={role} onChange={(e) => setRole(e.target.value as UserRole)} invalid={Boolean(formErrors.role)} aria-describedby={formErrors.role ? 'register-role-error' : undefined}>
                  <option value="admin">Администратор</option>
                  <option value="manager">Менеджер</option>
                  <option value="editor">Редактор</option>
                  <option value="viewer">Наблюдатель</option>
                </Select>
              </Field>
              <div className="rounded-[1.15rem] border border-border/75 bg-background-subtle/55 p-4 text-caption text-text-muted shadow-surface">
                <p className="font-semibold text-text">Подсказка</p>
                <p className="mt-1">Роль задает базовый набор прав. При необходимости включите ручную настройку.</p>
              </div>
            </div>
            <label className="flex items-center gap-2 text-body-sm text-text-muted">
              <input type="checkbox" checked={useCustomPermissions} onChange={(event) => setUseCustomPermissions(event.target.checked)} className="h-4 w-4 rounded border-border text-primary" />
              Настроить права вручную
            </label>
            {useCustomPermissions ? (
              <div className="grid gap-3 sm:grid-cols-2">
                {permissionCatalog.map((permission) => {
                  const checked = permissions.includes(permission.key)
                  return (
                    <label key={permission.key} className={`flex items-start gap-3 rounded-[1.15rem] border px-4 py-4 text-body-sm shadow-surface transition duration-fast ease-standard ${checked ? 'border-primary/35 bg-primary/10 text-text' : 'border-border/75 bg-surface/90 text-text hover:border-border-strong'}`}>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(event) => setPermissions((current) => event.target.checked ? [...current, permission.key] : current.filter((item) => item !== permission.key))}
                        className="mt-1 h-4 w-4 rounded border-border text-primary"
                      />
                      <span>
                        <span className="font-semibold text-text">{permission.label}</span>
                        <span className="mt-1 block text-caption text-text-muted">{permission.desc}</span>
                      </span>
                    </label>
                  )
                })}
                {formErrors.permissions ? <p className="text-caption text-danger sm:col-span-2">{formErrors.permissions}</p> : null}
              </div>
            ) : null}
          </section>

          {error ? <p className="rounded-panel border border-danger/25 bg-danger/10 px-4 py-3 text-body-sm text-danger" role="alert">{error}</p> : null}
          {successMessage ? <p className="rounded-panel border border-success/25 bg-success/10 px-4 py-3 text-body-sm text-success">{successMessage}</p> : null}
          <Button type="submit" loading={saving} fullWidth>Создать пользователя</Button>
        </SurfaceCard>

        <aside className="space-y-6">
          <SurfaceCard as="section" className="space-y-4 p-5">
            <div className="flex items-center gap-2">
              <Badge variant="info">Guide</Badge>
              <Badge variant="neutral">Structure</Badge>
            </div>
            <h3 className="text-h3 text-text">Как устроен раздел</h3>
            <p className="text-body-sm text-text-muted">Каждый блок отвечает за конкретную зону: профиль, доступ, уведомления, предпочтения и доступность.</p>
            <ul className="space-y-3 text-body-sm text-text-muted">
              <li className="flex items-start gap-2"><span className="mt-1 h-2 w-2 rounded-full bg-primary" aria-hidden="true" />Аккаунт: профиль, контактные данные, язык.</li>
              <li className="flex items-start gap-2"><span className="mt-1 h-2 w-2 rounded-full bg-success" aria-hidden="true" />Безопасность: роли, пароли, активные сессии.</li>
              <li className="flex items-start gap-2"><span className="mt-1 h-2 w-2 rounded-full bg-warning" aria-hidden="true" />Уведомления: каналы, расписания, критичность.</li>
              <li className="flex items-start gap-2"><span className="mt-1 h-2 w-2 rounded-full bg-secondary" aria-hidden="true" />Предпочтения: тема, формат дат, плотность интерфейса.</li>
              <li className="flex items-start gap-2"><span className="mt-1 h-2 w-2 rounded-full bg-accent" aria-hidden="true" />Доступность: контраст, размер шрифта, озвучка.</li>
            </ul>
          </SurfaceCard>

          <SurfaceCard as="section" className="space-y-4 p-5">
            <div className="flex items-center gap-2">
              <Badge variant="warning">Status</Badge>
              <Badge variant="neutral">Confirmation flow</Badge>
            </div>
            <h3 className="text-h3 text-text">Статус создания</h3>
            <p className="text-body-sm text-text-muted">Перед созданием пользователя система попросит подтвердить действие.</p>
            <div className="rounded-[1.15rem] border border-border/75 bg-background-subtle/55 p-4 text-caption text-text-muted shadow-surface">
              {confirmOpen ? 'Подтверждение ожидает вашего решения.' : 'Подтверждение не запрашивалось.'}
            </div>
          </SurfaceCard>
        </aside>
      </div>

      <Modal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="Подтвердите создание"
        footer={<><Button type="button" variant="secondary" onClick={() => setConfirmOpen(false)}>Отмена</Button><Button type="button" loading={saving} onClick={(event) => onSubmit(event as unknown as React.FormEvent)}>Подтвердить</Button></>}
      >
        <p className="text-body-sm text-text-muted">Создать пользователя <span className="font-semibold text-text">{fullName || username}</span> с ролью <span className="font-semibold text-text">{role}</span>?</p>
      </Modal>
    </PageShell>
  )
}
