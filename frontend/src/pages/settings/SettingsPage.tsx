import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { LANGUAGE_KEY, loadLanguagePreference } from '../../app/auth'
import { applyAppFontSize, applyCompactMode, DEFAULT_FONT_SIZE_PX, loadAppFontSize, loadCompactMode, MAX_FONT_SIZE_PX, MIN_FONT_SIZE_PX } from '../../app/preferences'
import { api } from '../../api/client'
import type { AdminUser, AuthUser, NotificationProfile, UserRole } from '../../api/types'
import { roleLabels } from '../../shared/lib/permissions'
import { TIMEZONE_OPTIONS, ensureProfileTimeZoneInitialized, getDeviceTimeZone, resolveTimeZone } from '../../shared/lib/timezone'
import { UserPlus } from 'lucide-react'
import { Button, Field, Modal, Select, Skeleton, TextInput } from '@/components/ui'
import { NotificationsSection } from './NotificationsSection'
import { SessionsSection } from './SessionsSection'
import { Initial, SettingsRow, SettingsSection, Switch } from './ui'

interface SettingsPageProps {
  user: AuthUser
  onUserUpdate: (user: AuthUser) => void
  onLogout: () => void
}

export function SettingsPage({ user, onUserUpdate, onLogout }: SettingsPageProps) {
  const [users, setUsers] = useState<AdminUser[]>([])
  const [loadingUsers, setLoadingUsers] = useState(false)
  const [usersError, setUsersError] = useState('')
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null)
  const [editRole, setEditRole] = useState<UserRole>('member')
  const [editFullName, setEditFullName] = useState('')
  const [savingUser, setSavingUser] = useState(false)
  const [editErrors, setEditErrors] = useState<Record<string, string>>({})
  const [selfPasswordOpen, setSelfPasswordOpen] = useState(false)
  const [selfPassword, setSelfPassword] = useState('')
  const [selfCurrentPassword, setSelfCurrentPassword] = useState('')
  const [selfPasswordError, setSelfPasswordError] = useState('')
  const [selfPasswordSaving, setSelfPasswordSaving] = useState(false)
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
  const [accountLanguage, setAccountLanguage] = useState(loadLanguagePreference())
  const [accountTimeZone, setAccountTimeZone] = useState(deviceTimeZone)
  const [accountSaving, setAccountSaving] = useState(false)
  const [accountMessage, setAccountMessage] = useState('')
  const [compactMode, setCompactMode] = useState(() => loadCompactMode())
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
    setAccountTimeZone(resolveTimeZone(notificationProfile?.timezone ?? deviceTimeZone))
  }, [deviceTimeZone, notificationProfile?.timezone])

  useEffect(() => {
    setFontSizePx(loadAppFontSize())
    setCompactMode(loadCompactMode())
  }, [])

  const onCompactModeChange = (enabled: boolean) => {
    setCompactMode(applyCompactMode(enabled))
  }

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

  const openPasswordForSelected = () => {
    if (selectedUser?.id !== user.id) {
      setPasswordOpen(true)
      return
    }
    setProfileOpen(false)
    setSelfPasswordOpen(true)
  }

  const closeSelfPassword = () => {
    setSelfPasswordOpen(false)
    setSelfPassword('')
    setSelfCurrentPassword('')
    setSelfPasswordError('')
  }

  const onChangeSelfPassword = async () => {
    const trimmed = selfPassword.trim()
    if (!selfCurrentPassword) {
      setSelfPasswordError('Введите текущий пароль')
      return
    }
    if (trimmed.length < 8) {
      setSelfPasswordError('Минимум 8 символов')
      return
    }
    setSelfPasswordError('')
    setSelfPasswordSaving(true)
    try {
      await api.changeUserPassword(user.id, { new_password: trimmed, current_password: selfCurrentPassword })
      closeSelfPassword()
    } catch (e) {
      setSelfPasswordError((e as Error).message)
    } finally {
      setSelfPasswordSaving(false)
    }
  }

  const openProfileFor = (item: AdminUser) => {
    selectUser(item)
    setProfileOpen(true)
  }

  const openPasswordFor = (item: AdminUser) => {
    selectUser(item)
    if (item.id === user.id) setSelfPasswordOpen(true)
    else setPasswordOpen(true)
  }

  const displayName = user.full_name || user.username
  const sections = useMemo(() => [
    { id: 'profile', label: 'Профиль' },
    { id: 'notifications', label: 'Уведомления' },
    { id: 'appearance', label: 'Внешний вид' },
    { id: 'security', label: 'Безопасность' },
    { id: 'sessions', label: 'Сессии' },
    ...(user.is_admin
      ? [
          { id: 'users', label: 'Пользователи' },
          { id: 'system', label: 'Система' },
        ]
      : []),
  ], [user.is_admin])

  return (
    <div className="mx-auto w-full max-w-5xl px-4 pb-16 pt-4 sm:px-6 lg:px-8 lg:pt-6">
      <div className="grid gap-10 lg:grid-cols-[11rem_minmax(0,1fr)]">
        <SettingsNav sections={sections} />

        <div className="min-w-0 space-y-10">
          <SettingsSection id="profile" title="Профиль" description="Как вас видят в семье и в каком часовом поясе считаются сроки.">
            <div className="flex items-center gap-4 px-5 py-4">
              <Initial name={displayName} size="lg" />
              <div className="min-w-0">
                <p className="truncate text-body font-semibold text-text">{displayName}</p>
                <p className="truncate text-body-sm text-text-muted">
                  {user.username} · {((user.role ? roleLabels[user.role] : null) ?? (user.is_admin ? 'Владелец' : 'Участник')).toLowerCase()}
                </p>
              </div>
            </div>
            <SettingsRow label="Имя" htmlFor="account-full-name" description="Видно в ленте задач и в списке исполнителей.">
              <TextInput id="account-full-name" value={accountFullName} onChange={(event) => setAccountFullName(event.target.value)} autoComplete="name" className="sm:w-64" />
            </SettingsRow>
            <SettingsRow label="Часовой пояс" htmlFor="account-timezone" description="По нему считаются «сегодня», сроки и время уведомлений.">
              <Select id="account-timezone" value={accountTimeZone} onChange={(event) => setAccountTimeZone(resolveTimeZone(event.target.value))} className="sm:w-64">
                {TIMEZONE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </Select>
            </SettingsRow>
            <SettingsRow label="Язык интерфейса" htmlFor="account-language">
              <Select id="account-language" value={accountLanguage} onChange={(event) => setAccountLanguage(event.target.value)} className="sm:w-64">
                <option value="ru">Русский</option>
                <option value="en">English</option>
                <option value="de">Deutsch</option>
              </Select>
            </SettingsRow>
            <div className="flex flex-wrap items-center justify-end gap-3 px-5 py-3">
              {accountMessage ? <p className="mr-auto text-body-sm text-success">{accountMessage}</p> : null}
              {notificationError ? <p className="mr-auto text-body-sm text-danger" role="alert">{notificationError}</p> : null}
              <Button type="button" variant="ghost" size="sm" onClick={() => setAccountFullName(displayName)}>Сбросить имя</Button>
              <Button type="button" size="sm" onClick={() => void saveAccountSettings()} loading={accountSaving}>Сохранить</Button>
            </div>
          </SettingsSection>

          <NotificationsSection />

          <SettingsSection id="appearance" title="Внешний вид" description="Хранится в этом браузере.">
            <SettingsRow label="Компактный режим" description="Плотнее строки и отступы, больше задач на экране." htmlFor="compact-mode">
              <Switch id="compact-mode" checked={compactMode} onChange={onCompactModeChange} label="Компактный режим" />
            </SettingsRow>
            <SettingsRow label="Размер шрифта" htmlFor="font-size" description="Меняет масштаб всего интерфейса.">
              <div className="flex items-center gap-3 sm:w-64">
                <span className="text-caption text-text-muted" aria-hidden="true">А</span>
                <input
                  id="font-size"
                  type="range"
                  min={MIN_FONT_SIZE_PX}
                  max={MAX_FONT_SIZE_PX}
                  value={fontSizePx}
                  onChange={(event) => {
                    const next = applyAppFontSize(Number(event.target.value) || DEFAULT_FONT_SIZE_PX)
                    setFontSizePx(next)
                  }}
                  className="h-1.5 flex-1 cursor-pointer accent-primary"
                />
                <span className="text-body text-text-muted" aria-hidden="true">А</span>
                <span className="w-12 text-right text-body-sm tabular-nums text-text">{fontSizePx} px</span>
              </div>
            </SettingsRow>
          </SettingsSection>

          <SettingsSection id="security" title="Безопасность">
            <SettingsRow label="Пароль" description="Меняйте не реже раза в 90 дней и не используйте его на других сайтах.">
              <Button type="button" variant="secondary" size="sm" onClick={() => setSelfPasswordOpen(true)}>Сменить пароль</Button>
            </SettingsRow>
          </SettingsSection>

          <SessionsSection onLogout={onLogout} />

          {user.is_admin ? (
            <SettingsSection
              id="users"
              title="Пользователи"
              description="Роли и доступ членов семьи."
              action={
                <Link
                  to="/register"
                  className="inline-flex min-h-10 items-center gap-1.5 rounded-control bg-primary px-3.5 py-2 text-caption font-semibold text-text-inverse shadow-surface transition hover:bg-primary-hover compact:min-h-8"
                >
                  <UserPlus className="h-4 w-4" aria-hidden="true" />
                  Добавить
                </Link>
              }
            >
              {loadingUsers && users.length === 0 ? <UsersListSkeleton /> : null}
              {!loadingUsers && users.length === 0 ? (
                <p className="px-5 py-4 text-body-sm text-text-muted">Пользователей пока нет.</p>
              ) : null}
              {users.map((item) => (
                <div key={item.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3">
                  <Initial name={item.full_name || item.username} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-body-sm font-medium text-text">
                      {item.full_name || item.username}
                      {item.id === user.id ? <span className="font-normal text-text-muted"> · вы</span> : null}
                    </p>
                    <p className="truncate text-caption font-normal text-text-muted">
                      {item.username} · {roleLabels[item.role] ?? item.role}
                    </p>
                  </div>
                  <div className="flex gap-1">
                    <Button type="button" variant="ghost" size="sm" onClick={() => openProfileFor(item)}>Изменить</Button>
                    <Button type="button" variant="ghost" size="sm" onClick={() => openPasswordFor(item)}>Пароль</Button>
                  </div>
                </div>
              ))}
              {usersError ? <p className="px-5 py-3 text-body-sm text-danger" role="alert">{usersError}</p> : null}
            </SettingsSection>
          ) : null}

          {user.is_admin ? (
            <SettingsSection id="system" title="Система" description="Действует для всех пользователей.">
              <SettingsRow
                label="Напоминания о просроченных задачах"
                htmlFor="overdue-interval"
                description={overdueIntervalSaving ? 'Сохраняем…' : 'Как часто повторять push, пока задача не выполнена.'}
              >
                <Select
                  id="overdue-interval"
                  value={overdueInterval}
                  onChange={(e) => {
                    const val = Number(e.target.value)
                    setOverdueInterval(val)
                    setOverdueIntervalSaving(true)
                    api.updateSiteSettings({ overdue_reminder_interval: val })
                      .then((settings) => setOverdueInterval(settings.overdue_reminder_interval))
                      .catch((err) => setNotificationError((err as Error).message))
                      .finally(() => setOverdueIntervalSaving(false))
                  }}
                  disabled={overdueIntervalSaving}
                  className="sm:w-52"
                >
                  <option value={5}>Каждые 5 минут</option>
                  <option value={10}>Каждые 10 минут</option>
                  <option value={30}>Каждые 30 минут</option>
                  <option value={60}>Каждый час</option>
                </Select>
              </SettingsRow>
            </SettingsSection>
          ) : null}
        </div>
      </div>

      <Modal
        open={selfPasswordOpen}
        onClose={closeSelfPassword}
        title="Сменить пароль"
        className="max-w-md"
        footer={
          <>
            <Button type="button" variant="secondary" onClick={closeSelfPassword}>Отмена</Button>
            <Button type="button" onClick={() => void onChangeSelfPassword()} loading={selfPasswordSaving}>Сохранить пароль</Button>
          </>
        }
      >
        <Field label="Текущий пароль" htmlFor="self-current-password">
          <TextInput id="self-current-password" type="password" value={selfCurrentPassword} onChange={(e) => setSelfCurrentPassword(e.target.value)} autoComplete="current-password" invalid={Boolean(selfPasswordError)} aria-describedby={selfPasswordError ? 'self-password-error' : undefined} />
        </Field>
        <Field label="Новый пароль" htmlFor="self-password" error={selfPasswordError} errorId="self-password-error">
          <TextInput id="self-password" type="password" value={selfPassword} onChange={(e) => setSelfPassword(e.target.value)} autoComplete="new-password" invalid={Boolean(selfPasswordError)} aria-describedby={selfPasswordError ? 'self-password-error' : undefined} />
        </Field>
      </Modal>

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
        className="max-w-xl"
        footer={
          <>
            <Button type="button" variant="secondary" onClick={() => setProfileOpen(false)}>Закрыть</Button>
            <Button type="button" variant="secondary" onClick={openPasswordForSelected}>Сменить пароль</Button>
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

            <div className="rounded-panel bg-background-subtle px-4 py-3 text-body-sm text-text-muted">
              Владелец имеет полный доступ. Участник видит и редактирует списки, но не может менять роли и удалять рабочее пространство.
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  )
}

function UsersListSkeleton() {
  return (
    <div aria-busy="true" aria-label="Загрузка пользователей">
      {Array.from({ length: 3 }).map((_, index) => (
        <div key={index} className="flex items-center gap-4 px-5 py-3">
          <Skeleton className="h-8 w-8 rounded-full" />
          <div className="min-w-0 flex-1 space-y-1.5">
            <Skeleton className="h-4 w-36 max-w-full" />
            <Skeleton className="h-3 w-24" />
          </div>
        </div>
      ))}
    </div>
  )
}

/** Оглавление настроек: подсвечивает раздел, который сейчас в верхней части экрана. */
function SettingsNav({ sections }: { sections: Array<{ id: string; label: string }> }) {
  const [active, setActive] = useState(sections[0]?.id ?? '')

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((entry) => entry.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)
        if (visible[0]) setActive(visible[0].target.id)
      },
      { rootMargin: '-20% 0px -70% 0px' },
    )
    for (const section of sections) {
      const el = document.getElementById(section.id)
      if (el) observer.observe(el)
    }
    return () => observer.disconnect()
  }, [sections])

  return (
    <nav aria-label="Разделы настроек" className="hidden lg:block">
      <ul className="sticky space-y-0.5" style={{ top: 'calc(var(--app-header-height) + 1.5rem)' }}>
        {sections.map((section) => (
          <li key={section.id}>
            <a
              href={`#${section.id}`}
              aria-current={active === section.id ? 'true' : undefined}
              onClick={() => setActive(section.id)}
              className={
                active === section.id
                  ? 'block rounded-control bg-surface-elevated px-3 py-1.5 text-body-sm font-medium text-text shadow-surface'
                  : 'block rounded-control px-3 py-1.5 text-body-sm text-text-muted transition hover:bg-surface-hover hover:text-text'
              }
            >
              {section.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  )
}
