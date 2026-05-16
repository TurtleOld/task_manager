import { Component, Suspense, useEffect, useMemo, useState } from 'react'
import type { ComponentType, ErrorInfo, ReactNode } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { Archive, CalendarDays, ChevronLeft, Inbox, LayoutDashboard, Menu, Search, Settings, SunMedium } from 'lucide-react'
import { useBoards } from '../api/queries/boards'
import type { AuthUser } from '../api/types'
import { CommandPalette } from './CommandPalette'
import { NotificationInboxButton } from './NotificationInboxButton'
import { toggleTheme } from './theme'
import { Button, Skeleton } from '@/components/ui'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { cn } from '@/lib/utils'

const SIDEBAR_COLLAPSED_KEY = 'app-shell.sidebar-collapsed'

class PageErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null }
  static getDerivedStateFromError(error: Error) { return { error } }
  componentDidCatch(error: Error, info: ErrorInfo) { console.error('[PageErrorBoundary]', error, info) }
  render() {
    if (this.state.error) {
      return (
        <div className="flex flex-col items-center justify-center gap-4 px-8 py-24 text-center">
          <p className="text-h3 text-text">Что-то пошло не так</p>
          <p className="max-w-md text-body-sm text-text-muted">{(this.state.error as Error).message}</p>
          <button
            type="button"
            className="rounded-control border border-border bg-surface px-4 py-2 text-body-sm transition hover:bg-surface-hover"
            onClick={() => this.setState({ error: null })}
          >
            Попробовать снова
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

interface AppShellProps {
  user: AuthUser
  onLogout: () => void
}

const pinnedViews = [
  { to: '/today', label: 'Мой день', icon: SunMedium },
  { to: '/calendar', label: 'Календарь', icon: CalendarDays },
  { to: '/inbox', label: 'Inbox', icon: Inbox },
  { to: '/archive', label: 'Архив', icon: Archive },
]

export function AppShell({ user, onLogout }: AppShellProps) {
  const location = useLocation()
  const { data: boards = [], isLoading: boardsLoading } = useBoards()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [commandOpen, setCommandOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === 'true'
    } catch {
      return false
    }
  })

  useEffect(() => {
    try {
      localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(collapsed))
    } catch {
      // localStorage may be unavailable in private mode.
    }
  }, [collapsed])

  useEffect(() => {
    setMobileOpen(false)
  }, [location.pathname])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setCommandOpen((open) => !open)
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  const boardId = getBoardId(location.pathname)
  const activeBoard = boardId ? boards.find((board) => board.id === boardId) : undefined
  const pageTitle = getPageTitle(location.pathname, activeBoard?.name)

  const breadcrumbs = useMemo(() => getBreadcrumbs(location.pathname, activeBoard?.name), [location.pathname, activeBoard?.name])

  const sidebar = (
    <ShellSidebar
      boards={boards}
      boardsLoading={boardsLoading}
      collapsed={collapsed}
      onCollapseToggle={() => setCollapsed((value) => !value)}
      onLogout={onLogout}
      user={user}
    />
  )

  return (
    <div className="min-h-screen bg-background/70 text-text">
      <div className="hidden lg:block">{sidebar}</div>

      <div className={cn('min-h-screen transition-[padding] duration-normal ease-standard lg:pl-72', collapsed && 'lg:pl-20')}>
        <header className="sticky top-0 z-sticky border-b border-border/80 bg-background/78 px-4 py-3 backdrop-blur-xl sm:px-6">
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
                <SheetTrigger asChild>
                  <button
                    type="button"
                    className="inline-flex h-10 w-10 items-center justify-center rounded-control border border-border bg-surface/90 text-text shadow-surface transition hover:border-border-strong hover:bg-surface-hover lg:hidden"
                    aria-label="Открыть навигацию"
                  >
                    <Menu className="h-5 w-5" aria-hidden="true" />
                  </button>
                </SheetTrigger>
                <SheetContent side="left" className="w-[21rem] max-w-[88vw] gap-0 border-sidebar-border bg-sidebar p-0 text-sidebar-foreground">
                  <SheetHeader className="sr-only">
                    <SheetTitle>Навигация</SheetTitle>
                  </SheetHeader>
                  <ShellSidebar
                    boards={boards}
                    boardsLoading={boardsLoading}
                    collapsed={false}
                    onCollapseToggle={() => undefined}
                    onLogout={onLogout}
                    user={user}
                    mobile
                  />
                </SheetContent>
              </Sheet>

              <div className="min-w-0">
                <nav className="flex min-w-0 items-center gap-2 text-caption text-text-muted" aria-label="Хлебные крошки">
                  {breadcrumbs.map((item, index) => (
                    <span key={`${item.label}-${index}`} className="inline-flex min-w-0 items-center gap-2">
                      {index > 0 ? <span aria-hidden="true">/</span> : null}
                      {item.to ? (
                        <Link to={item.to} className="truncate font-medium hover:text-primary">{item.label}</Link>
                      ) : (
                        <span className="truncate text-text">{item.label}</span>
                      )}
                    </span>
                  ))}
                </nav>
                <h1 className="truncate text-h3 text-text">{pageTitle}</h1>
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={() => setCommandOpen(true)}
                className="hidden min-h-10 items-center gap-2 rounded-control border border-border bg-surface/90 px-3 py-2 text-caption text-text-muted shadow-surface transition hover:border-border-strong hover:bg-surface-hover hover:text-text sm:inline-flex"
                aria-label="Открыть командную палитру"
              >
                <Search className="h-4 w-4" aria-hidden="true" />
                <span className="hidden md:inline">Поиск</span>
                <kbd className="hidden rounded-md border border-border bg-background-subtle px-1.5 py-0.5 text-[0.68rem] text-text-muted md:inline">⌘K</kbd>
              </button>
              <NotificationInboxButton />
              <Button type="button" variant="secondary" size="sm" onClick={toggleTheme} aria-label="Переключить тему">
                Тема
              </Button>
            </div>
          </div>
        </header>

        <main>
          <PageErrorBoundary key={location.pathname}>
            <Suspense fallback={<PageFallback />}>
              <Outlet />
            </Suspense>
          </PageErrorBoundary>
        </main>
      </div>
      <CommandPalette boards={boards} onLogout={onLogout} open={commandOpen} onOpenChange={setCommandOpen} />
    </div>
  )
}

function PageFallback() {
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4 px-6 py-10">
      <Skeleton className="h-10 w-64" />
      <Skeleton className="h-24 w-full" />
      <div className="grid gap-5 lg:grid-cols-3">
        <Skeleton className="h-80 w-full" />
        <Skeleton className="h-80 w-full" />
        <Skeleton className="h-80 w-full" />
      </div>
    </div>
  )
}

interface ShellSidebarProps {
  boards: { id: number; name: string; icon?: string; color?: string }[]
  boardsLoading: boolean
  collapsed: boolean
  mobile?: boolean
  onCollapseToggle: () => void
  onLogout: () => void
  user: AuthUser
}

function ShellSidebar({ boards, boardsLoading, collapsed, mobile = false, onCollapseToggle, onLogout, user }: ShellSidebarProps) {
  return (
    <aside
      className={cn(
        'fixed inset-y-0 left-0 z-sticky flex w-72 flex-col border-r border-sidebar-border bg-sidebar/96 px-3 py-4 text-sidebar-foreground shadow-surface backdrop-blur-xl transition-[width] duration-normal ease-standard',
        collapsed && !mobile && 'w-20',
        mobile && 'relative inset-auto z-auto h-full w-full border-r-0 shadow-none',
      )}
      aria-label="Основная навигация"
    >
      <div className={cn('flex items-center gap-2 px-1', collapsed && !mobile && 'flex-col gap-1')}>
        <Link to="/" className="flex min-w-0 flex-1 items-center gap-3 rounded-control px-2 py-2 transition hover:bg-sidebar-accent">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[image:var(--gradient-primary)] font-bold text-text-inverse shadow-elevated">TM</span>
          {!collapsed || mobile ? (
            <span className="min-w-0">
              <span className="block truncate text-body font-semibold">Task Manager</span>
            </span>
          ) : null}
        </Link>
        {!mobile ? (
          <button
            type="button"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-control border border-sidebar-border bg-surface/70 text-text-muted transition hover:border-border-strong hover:text-text"
            onClick={onCollapseToggle}
            aria-label={collapsed ? 'Развернуть sidebar' : 'Свернуть sidebar'}
          >
            <ChevronLeft className={cn('h-4 w-4 transition-transform', collapsed && 'rotate-180')} aria-hidden="true" />
          </button>
        ) : null}
      </div>
      <nav className="mt-5 flex-1 space-y-5 overflow-y-auto pr-1" aria-label="Разделы приложения">
        <NavSection title="Views" collapsed={collapsed && !mobile}>
          <ShellNavItem to="/" label="Доски" icon={LayoutDashboard} collapsed={collapsed && !mobile} end />
          {pinnedViews.map((item) => (
            <ShellNavItem key={item.to} to={item.to} label={item.label} icon={item.icon} collapsed={collapsed && !mobile} />
          ))}
        </NavSection>

        <NavSection title="Boards" collapsed={collapsed && !mobile}>
          {boardsLoading ? <BoardsNavSkeleton collapsed={collapsed && !mobile} /> : null}
          {!boardsLoading && boards.length === 0 ? (
            !collapsed || mobile ? <p className="px-3 text-caption text-text-muted">Пока нет досок</p> : null
          ) : null}
          {boards.map((board) => (
            <ShellNavItem
              key={board.id}
              to={`/boards/${board.id}`}
              label={board.name}
              icon={(props) => <BoardDotIcon {...props} icon={board.icon} color={board.color} />}
              collapsed={collapsed && !mobile}
            />
          ))}
        </NavSection>
      </nav>

      <div className="mt-4 border-t border-sidebar-border pt-4">
        <ShellNavItem to="/settings" label="Настройки" icon={Settings} collapsed={collapsed && !mobile} />
        <div className={cn('mt-3 flex items-center gap-3 rounded-[1.15rem] bg-background-subtle/55 p-3', collapsed && !mobile && 'justify-center p-2')}>
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/12 text-caption font-bold text-primary">
            {(user.full_name || user.username)[0]?.toUpperCase()}
          </span>
          {!collapsed || mobile ? (
            <div className="min-w-0 flex-1">
              <p className="truncate text-body-sm font-semibold text-text">{user.full_name || user.username}</p>
              <p className="truncate text-caption text-text-muted">{user.role === 'owner' || user.is_admin ? 'Owner' : 'Member'}</p>
            </div>
          ) : null}
        </div>
        {!collapsed || mobile ? (
          <Button type="button" variant="danger" size="sm" fullWidth className="mt-3" onClick={onLogout}>Выйти</Button>
        ) : (
          <button
            type="button"
            onClick={onLogout}
            className="mt-3 flex h-10 w-full items-center justify-center rounded-control border border-danger/25 bg-danger/8 text-danger transition hover:border-danger/40 hover:bg-danger/12"
            aria-label="Выйти"
          >
            ⎋
          </button>
        )}
      </div>
    </aside>
  )
}

function NavSection({ title, collapsed, children }: { title: string; collapsed: boolean; children: ReactNode }) {
  return (
    <section className="space-y-2">
      {!collapsed ? <p className="px-3 text-label uppercase text-text-muted">{title}</p> : null}
      <div className="space-y-1">{children}</div>
    </section>
  )
}

function ShellNavItem({ to, label, icon: Icon, collapsed, end = false }: { to: string; label: string; icon: ComponentType<{ className?: string }>; collapsed: boolean; end?: boolean }) {
  return (
    <NavLink
      to={to}
      end={end}
      title={collapsed ? label : undefined}
      className={({ isActive }) => cn(
        'flex min-h-10 items-center gap-3 rounded-control px-3 py-2 text-body-sm font-medium text-text-muted transition hover:bg-sidebar-accent hover:text-text',
        isActive && 'bg-primary/12 text-primary shadow-surface',
        collapsed && 'justify-center px-2',
      )}
    >
      <Icon className="h-4 w-4 shrink-0" />
      {!collapsed ? <span className="truncate">{label}</span> : null}
    </NavLink>
  )
}

function BoardDotIcon({ className, color, icon }: { className?: string; color?: string; icon?: string }) {
  return icon ? (
    <span className={cn('text-body-sm', className)} aria-hidden="true">{icon}</span>
  ) : (
    <span className={cn('h-2.5 w-2.5 rounded-full ring-4 ring-accent/12', className)} style={{ backgroundColor: color || '#2563eb' }} aria-hidden="true" />
  )
}

function BoardsNavSkeleton({ collapsed }: { collapsed: boolean }) {
  return (
    <div className="space-y-2" aria-busy="true" aria-label="Загрузка списка досок">
      {Array.from({ length: 3 }).map((_, index) => (
        <div key={index} className={cn('flex min-h-10 items-center gap-3 px-3 py-2', collapsed && 'justify-center px-2')}>
          <Skeleton className="h-4 w-4 rounded-full" />
          {!collapsed ? <Skeleton className="h-4 flex-1" /> : null}
        </div>
      ))}
    </div>
  )
}

function getBoardId(pathname: string) {
  const match = pathname.match(/^\/boards\/(\d+)/)
  return match?.[1] ? Number(match[1]) : null
}

function getPageTitle(pathname: string, boardName?: string) {
  if (pathname.startsWith('/boards/')) return boardName || 'Доска'
  if (pathname === '/settings') return 'Настройки'
  if (pathname === '/today') return 'Мой день'
  if (pathname === '/calendar') return 'Календарь'
  if (pathname === '/inbox') return 'Inbox'
  if (pathname === '/archive') return 'Архив'
  return 'Доски'
}

function getBreadcrumbs(pathname: string, boardName?: string) {
  if (pathname.startsWith('/boards/')) return [{ label: 'Доски', to: '/' }, { label: boardName || 'Доска' }]
  if (pathname === '/') return [{ label: 'Доски' }]
  return [{ label: 'Доски', to: '/' }, { label: getPageTitle(pathname, boardName) }]
}
