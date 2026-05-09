import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { LANGUAGE_KEY, loadLanguagePreference } from '../../app/auth'
import { api } from '../../api/client'
import type { AdminUser, AuthUser, NotificationProfile, PermissionKey, UserRole } from '../../api/types'
import { rolePresets, permissionCatalog } from '../../shared/lib/permissions'
import { TIMEZONE_OPTIONS, ensureProfileTimeZoneInitialized, getDeviceTimeZone, resolveTimeZone } from '../../shared/lib/timezone'
import { Badge, Button, Card as SurfaceCard, EmptyState, Field, PageShell, Select, TextInput } from '../../shared/ui'

interface SettingsPageProps {
  user: AuthUser
  onLogout: () => void
  onUserUpdate: (user: AuthUser) => void
}

export function SettingsPage({ user, onLogout, onUserUpdate }: SettingsPageProps) {
  const [users, setUsers] = useState<AdminUser[]>([])
  const [loadingUsers, setLoadingUsers] = useState(false)
  const [usersError, setUsersError] = useState('')
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null)
  const [editRole, setEditRole] = useState<UserRole>('viewer')
  const [editPermissions, setEditPermissions] = useState<PermissionKey[]>([])
  const [useCustomPermissions, setUseCustomPermissions] = useState(false)
  const [editFullName, setEditFullName] = useState('')
  const [savingUser, setSavingUser] = useState(false)
  const [editErrors, setEditErrors] = useState<Record<string, string>>({})
  const [passwordOpen, setPasswordOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const [newPassword, setNewPassword] = useState('')
  const [passwordError, setPasswordError] = useState('')
  const [passwordSaving, setPasswordSaving] = useState(false)
  const [notificationProfile, setNotificationProfile] = useState<NotificationProfile | null>(null)
  const [notificationError, setNotificationError] = useState('')
  const [overdueInterval, setOverdueInterval] = useState<number>(30)
  const [overdueIntervalSaving, setOverdueIntervalSaving] = useState(false)
  const deviceTimeZone = useMemo(() => getDeviceTimeZone(), [])
  const [accountFullName, setAccountFullName] = useState(user.full_name || user.username)
  const [accountEmail, setAccountEmail] = useState('')
  const [accountLanguage, setAccountLanguage] = useState(loadLanguagePreference())
  const [accountTimeZone, setAccountTimeZone] = useState(deviceTimeZone)
  const [accountSaving, setAccountSaving] = useState(false)
  const [accountMessage, setAccountMessage] = useState('')

  const loadUsers = async () => {
    if (!user.is_admin) return
    setLoadingUsers(true)
    setUsersError('')
    try {
      const data = await api.listUsers()
      setUsers(data)
      if (!selectedUser && data.length > 0) {
        const first = data[0]!
        setSelectedUser(first)
        setEditRole(first.role)
        setEditPermissions(first.permissions)
        setEditFullName(first.full_name)
      }
    } catch (e) {
      setUsersError((e as Error).message)
    } finally {
      setLoadingUsers(false)
    }
  }

  useEffect(() => {
    if (user.is_admin) {
      void loadUsers()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.is_admin])

  useEffect(() => {
    const loadNotifications = async () => {
      try {
        const profile = await api.getNotificationProfile()
        const nextProfile = await ensureProfileTimeZoneInitialized(profile, deviceTimeZone)
        setNotificationProfile(nextProfile)
        if (user.is_admin) {
          const settings = await api.getSiteSettings()
          setOverdueInterval(settings.overdue_reminder_interval)
        }
      } catch (e) {
        setNotificationError((e as Error).message)
      }
    }
    void loadNotifications()
  }, [deviceTimeZone, user.is_admin])

  useEffect(() => {
    setAccountFullName(user.full_name || user.username)
  }, [user.full_name, user.username])

  useEffect(() => {
    setAccountEmail(notificationProfile?.email ?? '')
    setAccountTimeZone(resolveTimeZone(notificationProfile?.timezone ?? deviceTimeZone))
  }, [deviceTimeZone, notificationProfile?.email, notificationProfile?.timezone])

  const saveAccountSettings = async () => {
    if (accountSaving) return
    setAccountSaving(true)
    setAccountMessage('')
    setNotificationError('')
    try {
      if (accountFullName.trim() && accountFullName.trim() !== (user.full_name || user.username)) {
        const updatedUser = await api.updateCurrentUser({ full_name: accountFullName.trim() })
        onUserUpdate({ ...user, ...updatedUser, full_name: updatedUser.full_name || user.full_name })
      }

      const updatedProfile = await api.updateNotificationProfile({
        email: accountEmail.trim(),
        timezone: resolveTimeZone(accountTimeZone),
      })
      setNotificationProfile(updatedProfile)

      localStorage.setItem(LANGUAGE_KEY, accountLanguage)
      setAccountMessage('Настройки сохранены')
    } catch (e) {
      setNotificationError((e as Error).message)
    } finally {
      setAccountSaving(false)
    }
  }

  const selectUser = (next: AdminUser) => {
    setSelectedUser(next)
    setEditRole(next.role)
    setEditPermissions(next.permissions)
    setEditFullName(next.full_name)
    setUseCustomPermissions(false)
    setEditErrors({})
    setPasswordOpen(false)
    setProfileOpen(false)
    setNewPassword('')
    setPasswordError('')
  }

  const onSaveUser = async () => {
    if (!selectedUser) return
    const nextErrors: Record<string, string> = {}
    if (!editFullName.trim()) nextErrors.fullName = 'Введите имя'
    if (!editRole) nextErrors.role = 'Выберите роль'
    if (useCustomPermissions && editPermissions.length === 0) {
      nextErrors.permissions = 'Выберите хотя бы одно право'
    }
    setEditErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) return

    setSavingUser(true)
    setUsersError('')
    try {
      const payload = {
        full_name: editFullName.trim(),
        role: editRole,
        permissions: useCustomPermissions ? editPermissions : rolePresets[editRole],
      }
      const updated = await api.updateUser(selectedUser.id, payload)
      setUsers((prev) => prev.map((item) => (item.id === updated.id ? updated : item)))
      setSelectedUser(updated)
      setEditRole(updated.role)
      setEditPermissions(updated.permissions)
    } catch (e) {
      setUsersError((e as Error).message)
    } finally {
      setSavingUser(false)
    }
  }

  const onChangePassword = async () => {
    if (!selectedUser) return
    const trimmed = newPassword.trim()
    if (trimmed.length < 8) {
      setPasswordError('Минимум 8 символов')
      return
    }
    setPasswordError('')
    setPasswordSaving(true)
    try {
      await api.changeUserPassword(selectedUser.id, { new_password: trimmed })
      setPasswordOpen(false)
      setNewPassword('')
    } catch (e) {
      setPasswordError((e as Error).message)
    } finally {
      setPasswordSaving(false)
    }
  }

  return (
    <PageShell width="2xl" padding="comfortable" spacing="sm">
      <header className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-h1 text-text">Настройки</h1>
          <p className="text-body-sm text-text-muted">Управление учетной записью и доступом.</p>
        </div>
        <Link
          to="/"
          className="inline-flex min-h-11 items-center gap-2 rounded-control border border-border bg-surface px-4 py-2 text-button text-text shadow-surface transition-colors duration-fast ease-standard hover:border-border-strong hover:bg-surface-hover"
        >
          Назад к доскам
        </Link>
      </header>

      <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="space-y-6">
          <SurfaceCard as="section">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-body-sm text-text-muted">Пользователь</p>
                <p className="text-h3 text-text">
                  {user.full_name || user.username}{' '}
                  {user.is_admin ? <Badge variant="success" className="ml-2">Администратор</Badge> : null}
                </p>
              </div>
              <Button onClick={onLogout} variant="danger">
                Выйти
              </Button>
            </div>
          </SurfaceCard>

          <SurfaceCard as="section">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-h3 text-text">Аккаунт</h2>
                <p className="mt-1 text-body-sm text-text-muted">Личные данные, рабочий профиль, язык интерфейса.</p>
              </div>
              <Badge variant="primary">Профиль</Badge>
            </div>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <Field label="Имя" htmlFor="account-full-name">
                <TextInput
                  id="account-full-name"
                  value={accountFullName}
                  onChange={(event) => setAccountFullName(event.target.value)}
                  autoComplete="name"
                />
              </Field>
              <Field label="Email" htmlFor="account-email">
                <TextInput
                  id="account-email"
                  type="email"
                  value={accountEmail}
                  onChange={(event) => setAccountEmail(event.target.value)}
                  placeholder="name@company.com"
                  autoComplete="email"
                />
              </Field>
              <Field label="Язык интерфейса" htmlFor="account-language">
                <Select id="account-language" value={accountLanguage} onChange={(event) => setAccountLanguage(event.target.value)}>
                  <option value="ru">Русский</option>
                  <option value="en">English</option>
                  <option value="de">Deutsch</option>
                </Select>
              </Field>
              <Field
                label="Часовой пояс"
                htmlFor="account-timezone"
                hint="Этот часовой пояс используется для отображения дат и времени в веб и мобильном приложении."
                hintId="account-timezone-hint"
              >
                <Select
                  id="account-timezone"
                  value={accountTimeZone}
                  onChange={(event) => {
                    setAccountTimeZone(resolveTimeZone(event.target.value))
                  }}
                  aria-describedby="account-timezone-hint"
                >
                  {TIMEZONE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            {accountMessage ? <p className="mt-4 text-body-sm text-success">{accountMessage}</p> : null}
            {notificationError ? <p className="mt-4 text-body-sm text-danger" role="alert">{notificationError}</p> : null}
            <Button
              type="button"
              onClick={() => void saveAccountSettings()}
              loading={accountSaving}
              variant="secondary"
              className="mt-4"
            >
              Сохранить изменения
            </Button>
          </SurfaceCard>

          <SurfaceCard as="section">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-h3 text-text">Безопасность</h2>
                <p className="mt-1 text-body-sm text-text-muted">Пароли, сессии, контроль доступа и 2FA.</p>
              </div>
              <Badge variant="success">Доступ</Badge>
            </div>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300">
                <p className="font-semibold text-slate-900 dark:text-slate-100">Активные сессии</p>
                <p className="mt-1">Последний вход: 10 минут назад</p>
                <button className="mt-3 inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 dark:border-slate-700 dark:text-slate-300">
                  Завершить все сеансы
                </button>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300">
                <p className="font-semibold text-slate-900 dark:text-slate-100">Пароль</p>
                <p className="mt-1">Обновляйте пароль раз в 90 дней.</p>
                <button className="mt-3 inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 dark:border-slate-700 dark:text-slate-300">
                  Сменить пароль
                </button>
              </div>
            </div>
          </SurfaceCard>

          {user.is_admin ? (
            <SurfaceCard as="section">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-h3 text-text">Уведомления</h2>
                  <p className="mt-1 text-body-sm text-text-muted">Настройки push-напоминаний для мобильного приложения.</p>
                </div>
                <Badge variant="warning">Push</Badge>
              </div>
              <div className="mt-4 rounded-control border border-border bg-background-subtle p-4">
                <p className="text-body-sm font-semibold text-text">Повторяющиеся напоминания о просроченных задачах</p>
                <p className="mt-1 text-caption text-text-muted">
                  Интервал отправки push-уведомлений о просроченных задачах всем пользователям.
                </p>
                <div className="mt-3 flex items-center gap-3">
                  <Select
                    value={overdueInterval}
                    onChange={(e) => {
                      const val = Number(e.target.value)
                      setOverdueInterval(val)
                      setOverdueIntervalSaving(true)
                      api.updateSiteSettings({ overdue_reminder_interval: val })
                        .then((s) => setOverdueInterval(s.overdue_reminder_interval))
                        .catch((e) => setNotificationError((e as Error).message))
                        .finally(() => setOverdueIntervalSaving(false))
                    }}
                    disabled={overdueIntervalSaving}
                    className="max-w-40"
                  >
                    <option value={5}>5 минут</option>
                    <option value={10}>10 минут</option>
                    <option value={30}>30 минут</option>
                    <option value={60}>1 час</option>
                  </Select>
                  {overdueIntervalSaving ? <span className="text-caption text-text-muted">Сохранение...</span> : null}
                </div>
                {notificationError ? <p className="mt-3 text-body-sm text-danger" role="alert">{notificationError}</p> : null}
              </div>
            </SurfaceCard>
          ) : null}
        </div>

        <div className="space-y-6">
          <SurfaceCard as="section">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-h3 text-text">Персональные предпочтения</h2>
                <p className="mt-1 text-body-sm text-text-muted">Внешний вид и плотность интерфейса.</p>
              </div>
              <Badge variant="info">UI</Badge>
            </div>
            <div className="mt-4 grid gap-4">
              <label className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm dark:border-slate-700 dark:bg-slate-950">
                Компактный режим
                <input type="checkbox" className="h-4 w-4 rounded border-slate-300 text-sky-600" />
              </label>
              <label className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm dark:border-slate-700 dark:bg-slate-950">
                Показывать быстрые подсказки
                <input type="checkbox" defaultChecked className="h-4 w-4 rounded border-slate-300 text-sky-600" />
              </label>
              <label className="block">
                <span className="text-xs font-semibold uppercase tracking-widest text-slate-500 dark:text-slate-400">Формат дат</span>
                <select className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100">
                  <option>ДД.ММ.ГГГГ</option>
                  <option>ММ/ДД/ГГГГ</option>
                  <option>ГГГГ-ММ-ДД</option>
                </select>
              </label>
            </div>
          </SurfaceCard>

          <SurfaceCard as="section">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-h3 text-text">Доступность</h2>
                <p className="mt-1 text-body-sm text-text-muted">Контраст, размер шрифта и ассистивные функции.</p>
              </div>
              <Badge variant="info">A11y</Badge>
            </div>
            <div className="mt-4 space-y-4">
              <label className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm dark:border-slate-700 dark:bg-slate-950">
                Повышенный контраст
                <input type="checkbox" className="h-4 w-4 rounded border-slate-300 text-sky-600" />
              </label>
              <label className="block">
                <span className="text-xs font-semibold uppercase tracking-widest text-slate-500 dark:text-slate-400">Размер шрифта</span>
                <input type="range" min={12} max={20} defaultValue={14} className="mt-2 w-full" />
                <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">14 px</div>
              </label>
              <label className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm dark:border-slate-700 dark:bg-slate-950">
                Озвучивание событий
                <input type="checkbox" className="h-4 w-4 rounded border-slate-300 text-sky-600" />
              </label>
            </div>
          </SurfaceCard>

          {user.is_admin ? (
            <SurfaceCard as="section">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-h3 text-text">Пользователи</h2>
                  <p className="mt-1 text-body-sm text-text-muted">Управляйте пользователями, ролями и доступами.</p>
                </div>
                <Link
                  to="/register"
                  className="inline-flex min-h-11 items-center gap-2 rounded-control bg-primary px-4 py-2 text-button text-text-inverse shadow-surface transition-colors duration-fast ease-standard hover:bg-primary-hover"
                >
                  Создать пользователя
                </Link>
              </div>

              <div className="mt-6 grid gap-4 lg:grid-cols-[0.8fr_1.2fr] xl:grid-cols-[0.7fr_1.3fr]">
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-body-sm text-text-muted">
                    <span>Список пользователей</span>
                    <Button type="button" onClick={loadUsers} variant="secondary" size="sm">
                      Обновить
                    </Button>
                  </div>
                  <div className="space-y-2">
                    {loadingUsers ? <p className="text-body-sm text-text-muted">Загрузка...</p> : null}
                    {users.map((item) => (
                      <div
                        key={item.id}
                        className={`w-full rounded-xl border px-3 py-3 text-left text-sm ${
                          selectedUser?.id === item.id
                            ? 'border-sky-500 bg-sky-50 text-slate-900 dark:border-sky-400 dark:bg-slate-900'
                            : 'border-slate-200 bg-white text-slate-600 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between">
                              <span className="truncate font-semibold">{item.full_name || item.username}</span>
                              <span className="ml-2 shrink-0 text-xs text-slate-400">#{item.id}</span>
                            </div>
                            <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">{item.username}</div>
                          </div>
                          <button
                            type="button"
                            onClick={() => selectUser(item)}
                            className="shrink-0 rounded-lg border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-600 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300"
                          >
                            Выбрать
                          </button>
                        </div>
                      </div>
                    ))}
                    {!loadingUsers && users.length === 0 ? (
                      <EmptyState title="Пользователи не найдены" className="p-4">
                        Создайте первого пользователя для управления доступом.
                      </EmptyState>
                    ) : null}
                  </div>
                  {usersError ? <p className="text-body-sm text-danger" role="alert">{usersError}</p> : null}
                </div>

                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-950">
                  {selectedUser ? (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-xs uppercase tracking-widest text-slate-500 dark:text-slate-400">Профиль пользователя</p>
                          <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                            {selectedUser.full_name || selectedUser.username}
                          </h3>
                        </div>
                        {selectedUser.is_admin ? <Badge variant="success">Админ</Badge> : null}
                      </div>
                      <p className="text-sm text-slate-600 dark:text-slate-400">
                        Откройте полный профиль, чтобы управлять ролью и правами пользователя.
                      </p>
                      <div className="flex flex-wrap items-center gap-2">
                        <Button type="button" onClick={() => setProfileOpen(true)}>
                          Открыть профиль
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-slate-500 dark:text-slate-400">Выберите пользователя.</p>
                  )}
                </div>
              </div>
            </SurfaceCard>
          ) : null}
        </div>
      </div>

      {passwordOpen && selectedUser ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl dark:bg-slate-900">
            <h3 className="text-lg font-semibold">Сменить пароль</h3>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
              Новый пароль для <span className="font-semibold">{selectedUser.username}</span>
            </p>
            <label className="mt-4 block">
              <span className="text-xs font-semibold uppercase tracking-widest text-slate-500 dark:text-slate-400">Новый пароль</span>
              <input
                type="password"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              />
            </label>
            {passwordError ? <p className="mt-2 text-sm text-rose-600">{passwordError}</p> : null}
            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setPasswordOpen(false)}
                className="inline-flex items-center justify-center rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200"
              >
                Отмена
              </button>
              <button
                type="button"
                disabled={passwordSaving}
                onClick={onChangePassword}
                className="inline-flex items-center justify-center rounded-xl bg-sky-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-sky-500 disabled:opacity-60"
              >
                Сохранить пароль
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {profileOpen && selectedUser ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-5xl rounded-2xl bg-white p-6 shadow-xl dark:bg-slate-900">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-widest text-slate-500 dark:text-slate-400">Профиль пользователя</p>
                <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                  {selectedUser.full_name || selectedUser.username}
                </h3>
              </div>
              <div className="flex items-center gap-2">
                {selectedUser.is_admin ? (
                  <span className="rounded-full bg-emerald-500/10 px-2 py-1 text-xs font-semibold text-emerald-600 dark:text-emerald-300">
                    Админ
                  </span>
                ) : null}
                <button
                  type="button"
                  onClick={() => setProfileOpen(false)}
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200"
                >
                  Закрыть
                </button>
              </div>
            </div>

            <div className="mt-6 space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className="text-xs font-semibold uppercase tracking-widest text-slate-500 dark:text-slate-400">Имя</span>
                  <input
                    value={editFullName}
                    onChange={(event) => setEditFullName(event.target.value)}
                    className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                  />
                  {editErrors.fullName ? <p className="mt-1 text-xs text-rose-600">{editErrors.fullName}</p> : null}
                </label>
                <label className="block">
                  <span className="text-xs font-semibold uppercase tracking-widest text-slate-500 dark:text-slate-400">Роль</span>
                  <select
                    value={editRole}
                    onChange={(event) => setEditRole(event.target.value as UserRole)}
                    className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                  >
                    <option value="admin">Администратор</option>
                    <option value="manager">Менеджер</option>
                    <option value="editor">Редактор</option>
                    <option value="viewer">Наблюдатель</option>
                  </select>
                  {editErrors.role ? <p className="mt-1 text-xs text-rose-600">{editErrors.role}</p> : null}
                </label>
              </div>

              <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                <input
                  type="checkbox"
                  checked={useCustomPermissions}
                  onChange={(event) => {
                    const checked = event.target.checked
                    setUseCustomPermissions(checked)
                    if (!checked) {
                      setEditPermissions(rolePresets[editRole])
                    }
                  }}
                  className="h-4 w-4 rounded border-slate-300 text-sky-600"
                />
                Редактировать права вручную
              </label>

              {useCustomPermissions ? (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3 xl:gap-5">
                  {permissionCatalog.map((permission) => {
                    const checked = editPermissions.includes(permission.key)
                    return (
                      <label
                        key={permission.key}
                        className={`flex h-full w-full items-start gap-3 rounded-2xl border px-4 py-4 text-sm shadow-sm transition ${
                          checked
                            ? 'border-sky-500/70 bg-sky-50 ring-1 ring-sky-200 dark:border-sky-400/60 dark:bg-slate-900 dark:ring-sky-500/20'
                            : 'border-slate-200 bg-white hover:border-slate-300 hover:shadow-md dark:border-slate-700 dark:bg-slate-950 dark:hover:border-slate-500/70'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(event) => {
                            setEditPermissions((current) =>
                              event.target.checked
                                ? [...current, permission.key]
                                : current.filter((item) => item !== permission.key)
                            )
                          }}
                          className="mt-1 h-4 w-4 shrink-0 rounded border-slate-300 text-sky-600"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block wrap-break-word text-[13px] font-semibold leading-snug text-slate-900 dark:text-slate-100">
                            {permission.label}
                          </span>
                          <span className="mt-1 block break-words text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                            {permission.desc}
                          </span>
                        </span>
                      </label>
                    )
                  })}
                  {editErrors.permissions ? (
                    <p className="text-xs text-rose-600 md:col-span-2 xl:col-span-3">{editErrors.permissions}</p>
                  ) : null}
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-slate-200 bg-white px-3 py-2 text-xs text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">
                  Права соответствуют выбранной роли. Для кастомизации включите ручной режим.
                </div>
              )}

              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={onSaveUser}
                    disabled={savingUser}
                    className="inline-flex items-center gap-2 rounded-xl bg-sky-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-sky-500 disabled:opacity-60"
                  >
                    Сохранить
                  </button>
                  <button
                    type="button"
                    onClick={() => setPasswordOpen(true)}
                    className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200"
                  >
                    Сменить пароль
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => setProfileOpen(false)}
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200"
                >
                  Закрыть
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </PageShell>
  )
}
