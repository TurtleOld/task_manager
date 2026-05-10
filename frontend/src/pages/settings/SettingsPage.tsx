import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { LANGUAGE_KEY, loadLanguagePreference } from '../../app/auth'
import { applyAppFontSize, DEFAULT_FONT_SIZE_PX, loadAppFontSize, MAX_FONT_SIZE_PX, MIN_FONT_SIZE_PX } from '../../app/preferences'
import { api } from '../../api/client'
import type { AdminUser, AuthUser, NotificationProfile, UserRole } from '../../api/types'
import { roleLabels } from '../../shared/lib/permissions'
import { TIMEZONE_OPTIONS, ensureProfileTimeZoneInitialized, getDeviceTimeZone, resolveTimeZone } from '../../shared/lib/timezone'
import { Badge, Button, Card as SurfaceCard, EmptyState, Field, Modal, PageShell, Select, Skeleton, TextInput } from '../../shared/ui'

interface SettingsPageProps {
  user: AuthUser
  onUserUpdate: (user: AuthUser) => void
}

export function SettingsPage({ user, onUserUpdate }: SettingsPageProps) {
  const [users, setUsers] = useState<AdminUser[]>([])
  const [loadingUsers, setLoadingUsers] = useState(false)
  const [usersError, setUsersError] = useState('')
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null)
  const [editRole, setEditRole] = useState<UserRole>('member')
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
  const [fontSizePx, setFontSizePx] = useState(() => loadAppFontSize())

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

  useEffect(() => {
    setFontSizePx(loadAppFontSize())
  }, [])

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
    setEditFullName(next.full_name)
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
    setEditErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) return

    setSavingUser(true)
    setUsersError('')
    try {
      const payload = {
        full_name: editFullName.trim(),
        role: editRole,
      }
      const updated = await api.updateUser(selectedUser.id, payload)
      setUsers((prev) => prev.map((item) => (item.id === updated.id ? updated : item)))
      setSelectedUser(updated)
      setEditRole(updated.role)
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

  const userCountLabel = user.is_admin ? `${users.length || 0} пользователей` : 'Личный профиль'

  return (
    <PageShell width="2xl" padding="comfortable" spacing="md">
      <header className="rounded-[1.6rem] border border-border/80 bg-[image:var(--gradient-surface)] px-6 py-6 shadow-elevated backdrop-blur">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="primary">Settings</Badge>
              <Badge variant="neutral">{user.is_admin ? 'Admin workspace' : 'Personal workspace'}</Badge>
              <Badge variant="info">{userCountLabel}</Badge>
            </div>
            <div>
              <h1 className="text-h1 text-text">Настройки</h1>
              <p className="mt-2 max-w-3xl text-body-sm text-text-muted">
                Управляйте профилем, уведомлениями, пользовательскими настройками и доступом из единого административного центра.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link
              to="/"
              className="inline-flex min-h-11 items-center gap-2 rounded-control border border-border bg-surface/90 px-4 py-2 text-button text-text shadow-surface backdrop-blur transition duration-fast ease-standard hover:border-border-strong hover:bg-surface-hover"
            >
              Назад к доскам
            </Link>
          </div>
        </div>
      </header>

      <section className="grid gap-4 md:grid-cols-3">
        <SurfaceCard className="p-5">
          <p className="text-caption uppercase text-text-muted">Профиль</p>
          <h2 className="mt-2 text-h3 text-text">{user.full_name || user.username}</h2>
          <p className="mt-1 text-body-sm text-text-muted">{user.username}</p>
        </SurfaceCard>
        <SurfaceCard className="p-5">
          <p className="text-caption uppercase text-text-muted">Часовой пояс</p>
          <h2 className="mt-2 text-h3 text-text">{accountTimeZone}</h2>
          <p className="mt-1 text-body-sm text-text-muted">Используется в web и mobile интерфейсах</p>
        </SurfaceCard>
        <SurfaceCard className="p-5">
          <p className="text-caption uppercase text-text-muted">Роль</p>
          <h2 className="mt-2 text-h3 text-text">{user.is_admin ? 'Администратор' : 'Участник'}</h2>
          <p className="mt-1 text-body-sm text-text-muted">{user.is_admin ? 'Расширенные права управления системой' : 'Личные настройки и уведомления'}</p>
        </SurfaceCard>
      </section>

      <div className="grid gap-6 lg:grid-cols-[1.08fr_0.92fr]">
        <div className="space-y-6">
          <SurfaceCard as="section" className="space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <Badge variant="primary">Profile</Badge>
                  <Badge variant="neutral">Account settings</Badge>
                </div>
                <h2 className="mt-3 text-h3 text-text">Аккаунт</h2>
                <p className="mt-1 text-body-sm text-text-muted">Личные данные, язык интерфейса и рабочий часовой пояс.</p>
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Имя" htmlFor="account-full-name">
                <TextInput id="account-full-name" value={accountFullName} onChange={(event) => setAccountFullName(event.target.value)} autoComplete="name" />
              </Field>
              <Field label="Email" htmlFor="account-email">
                <TextInput id="account-email" type="email" value={accountEmail} onChange={(event) => setAccountEmail(event.target.value)} placeholder="name@company.com" autoComplete="email" />
              </Field>
              <Field label="Язык интерфейса" htmlFor="account-language">
                <Select id="account-language" value={accountLanguage} onChange={(event) => setAccountLanguage(event.target.value)}>
                  <option value="ru">Русский</option>
                  <option value="en">English</option>
                  <option value="de">Deutsch</option>
                </Select>
              </Field>
              <Field label="Часовой пояс" htmlFor="account-timezone" hint="Используется для отображения дат, сроков и уведомлений." hintId="account-timezone-hint">
                <Select id="account-timezone" value={accountTimeZone} onChange={(event) => setAccountTimeZone(resolveTimeZone(event.target.value))} aria-describedby="account-timezone-hint">
                  {TIMEZONE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </Select>
              </Field>
            </div>
            {accountMessage ? <p className="text-body-sm text-success">{accountMessage}</p> : null}
            {notificationError ? <p className="text-body-sm text-danger" role="alert">{notificationError}</p> : null}
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" onClick={() => void saveAccountSettings()} loading={accountSaving}>Сохранить изменения</Button>
              <Button type="button" variant="secondary" onClick={() => setAccountFullName(user.full_name || user.username)}>Сбросить имя</Button>
            </div>
          </SurfaceCard>

          <SurfaceCard as="section" className="space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <Badge variant="success">Security</Badge>
                  <Badge variant="neutral">Access hygiene</Badge>
                </div>
                <h2 className="mt-3 text-h3 text-text">Безопасность</h2>
                <p className="mt-1 text-body-sm text-text-muted">Следите за сессиями, паролем и общим состоянием доступа.</p>
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-[1.15rem] border border-border/75 bg-background-subtle/55 p-4 shadow-surface">
                <p className="text-caption uppercase text-text-muted">Активные сессии</p>
                <h3 className="mt-2 text-body font-semibold text-text">Последний вход: 10 минут назад</h3>
                <p className="mt-1 text-body-sm text-text-muted">Завершайте все сеансы при подозрительной активности.</p>
                <Button type="button" variant="secondary" size="sm" className="mt-4">Завершить все сеансы</Button>
              </div>
              <div className="rounded-[1.15rem] border border-border/75 bg-background-subtle/55 p-4 shadow-surface">
                <p className="text-caption uppercase text-text-muted">Пароль</p>
                <h3 className="mt-2 text-body font-semibold text-text">Регулярное обновление</h3>
                <p className="mt-1 text-body-sm text-text-muted">Рекомендуется менять пароль не реже одного раза в 90 дней.</p>
                <Button type="button" variant="secondary" size="sm" className="mt-4" onClick={() => setPasswordOpen(true)}>Сменить пароль</Button>
              </div>
            </div>
          </SurfaceCard>

          {user.is_admin ? (
            <SurfaceCard as="section" className="space-y-5">
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <Badge variant="warning">Push</Badge>
                    <Badge variant="neutral">System reminders</Badge>
                  </div>
                  <h2 className="mt-3 text-h3 text-text">Уведомления</h2>
                  <p className="mt-1 text-body-sm text-text-muted">Глобальные параметры push-напоминаний для мобильного приложения.</p>
                </div>
              </div>
              <div className="rounded-[1.15rem] border border-border/75 bg-background-subtle/55 p-4 shadow-surface">
                <p className="text-body-sm font-semibold text-text">Повторяющиеся напоминания о просроченных задачах</p>
                <p className="mt-1 text-caption text-text-muted">Интервал отправки push-уведомлений о просроченных задачах всем пользователям.</p>
                <div className="mt-4 flex flex-wrap items-center gap-3">
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
                    className="max-w-44"
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
          <SurfaceCard as="section" className="space-y-5">
            <div>
              <div className="flex items-center gap-2">
                <Badge variant="info">Preferences</Badge>
                <Badge variant="neutral">Display</Badge>
              </div>
              <h2 className="mt-3 text-h3 text-text">Персональные предпочтения</h2>
              <p className="mt-1 text-body-sm text-text-muted">Внешний вид, подсказки и базовые параметры отображения.</p>
            </div>
            <div className="grid gap-4">
              <label className="flex items-center justify-between rounded-[1.15rem] border border-border/75 bg-background-subtle/55 px-4 py-3 text-body-sm text-text shadow-surface">
                Компактный режим
                <input type="checkbox" className="h-4 w-4 rounded border-border text-primary" />
              </label>
              <label className="flex items-center justify-between rounded-[1.15rem] border border-border/75 bg-background-subtle/55 px-4 py-3 text-body-sm text-text shadow-surface">
                Показывать быстрые подсказки
                <input type="checkbox" defaultChecked className="h-4 w-4 rounded border-border text-primary" />
              </label>
              <div className="rounded-[1.15rem] border border-border/75 bg-background-subtle/55 p-4 shadow-surface">
                <span className="text-label uppercase text-text-muted">Формат дат</span>
                <select className="mt-3 w-full rounded-control border border-border/90 bg-surface/90 px-3.5 py-2.5 text-body-sm text-text shadow-surface backdrop-blur">
                  <option>ДД.ММ.ГГГГ</option>
                  <option>ММ/ДД/ГГГГ</option>
                  <option>ГГГГ-ММ-ДД</option>
                </select>
              </div>
            </div>
          </SurfaceCard>

          <SurfaceCard as="section" className="space-y-5">
            <div>
              <div className="flex items-center gap-2">
                <Badge variant="info">A11y</Badge>
                <Badge variant="neutral">Comfort</Badge>
              </div>
              <h2 className="mt-3 text-h3 text-text">Доступность</h2>
              <p className="mt-1 text-body-sm text-text-muted">Контраст, размер шрифта и вспомогательные функции интерфейса.</p>
            </div>
            <div className="space-y-4">
              <label className="flex items-center justify-between rounded-[1.15rem] border border-border/75 bg-background-subtle/55 px-4 py-3 text-body-sm text-text shadow-surface">
                Повышенный контраст
                <input type="checkbox" className="h-4 w-4 rounded border-border text-primary" />
              </label>
              <div className="rounded-[1.15rem] border border-border/75 bg-background-subtle/55 p-4 shadow-surface">
                <span className="text-label uppercase text-text-muted">Размер шрифта</span>
                <input
                  type="range"
                  min={MIN_FONT_SIZE_PX}
                  max={MAX_FONT_SIZE_PX}
                  value={fontSizePx}
                  onChange={(event) => {
                    const next = applyAppFontSize(Number(event.target.value) || DEFAULT_FONT_SIZE_PX)
                    setFontSizePx(next)
                  }}
                  className="mt-3 w-full"
                />
                <div className="mt-2 text-caption text-text-muted">{fontSizePx} px</div>
              </div>
              <label className="flex items-center justify-between rounded-[1.15rem] border border-border/75 bg-background-subtle/55 px-4 py-3 text-body-sm text-text shadow-surface">
                Озвучивание событий
                <input type="checkbox" className="h-4 w-4 rounded border-border text-primary" />
              </label>
            </div>
          </SurfaceCard>

          {user.is_admin ? (
            <SurfaceCard as="section" className="space-y-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <Badge variant="primary">Users</Badge>
                    <Badge variant="neutral">Access control</Badge>
                  </div>
                  <h2 className="mt-3 text-h3 text-text">Пользователи</h2>
                  <p className="mt-1 text-body-sm text-text-muted">Управляйте ролями, профилями и правами доступа команды.</p>
                </div>
                <Link to="/register" className="inline-flex min-h-11 items-center gap-2 rounded-control bg-[image:var(--gradient-primary)] px-4 py-2 text-button text-text-inverse shadow-elevated transition duration-fast ease-standard hover:brightness-[1.03]">
                  Создать пользователя
                </Link>
              </div>

              <div className="grid gap-4 lg:grid-cols-[0.82fr_1.18fr]">
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-body-sm text-text-muted">
                    <span>Список пользователей</span>
                    <Button type="button" onClick={loadUsers} variant="secondary" size="sm">Обновить</Button>
                  </div>
                  <div className="space-y-2">
                    {loadingUsers ? <UsersListSkeleton /> : null}
                    {users.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => selectUser(item)}
                        className={`w-full rounded-[1.15rem] border px-4 py-4 text-left shadow-surface transition duration-fast ease-standard ${
                          selectedUser?.id === item.id
                            ? 'border-primary/35 bg-primary/10 text-text'
                            : 'border-border/75 bg-surface/90 text-text hover:border-border-strong'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between gap-2">
                              <span className="truncate font-semibold">{item.full_name || item.username}</span>
                              <span className="shrink-0 text-caption text-text-muted">#{item.id}</span>
                            </div>
                            <div className="mt-1 text-caption text-text-muted">{item.username}</div>
                          </div>
                          {item.is_admin ? <Badge variant="success">Admin</Badge> : null}
                        </div>
                      </button>
                    ))}
                    {!loadingUsers && users.length === 0 ? (
                      <EmptyState title="Пользователи не найдены" className="p-4">Создайте первого пользователя для управления доступом.</EmptyState>
                    ) : null}
                  </div>
                  {usersError ? <p className="text-body-sm text-danger" role="alert">{usersError}</p> : null}
                </div>

                <div className="rounded-[1.25rem] border border-border/75 bg-background-subtle/55 p-5 shadow-surface">
                  {selectedUser ? (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-label uppercase text-text-muted">Профиль пользователя</p>
                          <h3 className="mt-2 text-h3 text-text">{selectedUser.full_name || selectedUser.username}</h3>
                          <p className="mt-1 text-body-sm text-text-muted">{selectedUser.username}</p>
                        </div>
                        {selectedUser.is_admin ? <Badge variant="success">Админ</Badge> : <Badge variant="neutral">Участник</Badge>}
                      </div>
                      <p className="text-body-sm text-text-muted">Откройте полный профиль, чтобы управлять ролью, правами и паролем пользователя.</p>
                      <div className="flex flex-wrap items-center gap-2">
                        <Button type="button" onClick={() => setProfileOpen(true)}>Открыть профиль</Button>
                        <Button type="button" variant="secondary" onClick={() => setPasswordOpen(true)}>Сменить пароль</Button>
                      </div>
                    </div>
                  ) : (
                    <EmptyState title="Пользователь не выбран" className="p-4 text-left">Выберите пользователя в списке слева для просмотра и редактирования профиля.</EmptyState>
                  )}
                </div>
              </div>
            </SurfaceCard>
          ) : null}
        </div>
      </div>

      <Modal
        open={passwordOpen && Boolean(selectedUser)}
        onClose={() => setPasswordOpen(false)}
        title="Сменить пароль"
        className="max-w-md"
        footer={
          <>
            <Button type="button" variant="secondary" onClick={() => setPasswordOpen(false)}>Отмена</Button>
            <Button type="button" onClick={() => void onChangePassword()} loading={passwordSaving}>Сохранить пароль</Button>
          </>
        }
      >
        {selectedUser ? (
          <div className="space-y-4">
            <p className="text-body-sm text-text-muted">Новый пароль для <span className="font-semibold text-text">{selectedUser.username}</span></p>
            <Field label="Новый пароль" htmlFor="user-password" error={passwordError} errorId="user-password-error">
              <TextInput id="user-password" type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} invalid={Boolean(passwordError)} aria-describedby={passwordError ? 'user-password-error' : undefined} />
            </Field>
          </div>
        ) : null}
      </Modal>

      <Modal
        open={profileOpen && Boolean(selectedUser)}
        onClose={() => setProfileOpen(false)}
        title={selectedUser ? `Профиль: ${selectedUser.full_name || selectedUser.username}` : 'Профиль пользователя'}
        className="max-w-5xl"
        footer={
          <>
            <Button type="button" variant="secondary" onClick={() => setProfileOpen(false)}>Закрыть</Button>
            <Button type="button" variant="secondary" onClick={() => setPasswordOpen(true)}>Сменить пароль</Button>
            <Button type="button" onClick={() => void onSaveUser()} loading={savingUser}>Сохранить</Button>
          </>
        }
      >
        {selectedUser ? (
          <div className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Имя" htmlFor="edit-full-name" error={editErrors.fullName} errorId="edit-full-name-error">
                <TextInput id="edit-full-name" value={editFullName} onChange={(event) => setEditFullName(event.target.value)} invalid={Boolean(editErrors.fullName)} aria-describedby={editErrors.fullName ? 'edit-full-name-error' : undefined} />
              </Field>
              <Field label="Роль" htmlFor="edit-role" error={editErrors.role} errorId="edit-role-error">
                <Select id="edit-role" value={editRole} onChange={(event) => setEditRole(event.target.value as UserRole)} invalid={Boolean(editErrors.role)} aria-describedby={editErrors.role ? 'edit-role-error' : undefined}>
                  <option value="owner">{roleLabels.owner}</option>
                  <option value="member">{roleLabels.member}</option>
                </Select>
              </Field>
            </div>

            <div className="rounded-panel border border-dashed border-border bg-background-subtle/55 px-4 py-3 text-caption text-text-muted">
              Владелец имеет полный доступ. Участник видит и редактирует доски, но не может менять роли и удалять рабочее пространство.
            </div>
          </div>
        ) : null}
      </Modal>
    </PageShell>
  )
}

function UsersListSkeleton() {
  return (
    <div className="space-y-2" aria-busy="true" aria-label="Загрузка пользователей">
      {Array.from({ length: 3 }).map((_, index) => (
        <div key={index} className="rounded-[1.15rem] border border-border/75 bg-surface/90 px-4 py-4 shadow-surface">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <Skeleton className="h-5 w-36 max-w-full" />
                <Skeleton className="h-4 w-10" />
              </div>
              <Skeleton className="h-4 w-28" />
            </div>
            <Skeleton className="h-6 w-16 rounded-full" />
          </div>
        </div>
      ))}
    </div>
  )
}
