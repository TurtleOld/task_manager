import { Component, lazy } from 'react'
import type { ErrorInfo, ReactNode } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { AppShell } from './app/AppShell'
import { ProtectedRoute } from './app/ProtectedRoute'
import { resolveLegacyRedirect } from './app/routeRedirects'
import { LoginPage } from './pages/auth/LoginPage'
import { RegisterPage } from './pages/auth/RegisterPage'
import { SettingsPage } from './pages/settings/SettingsPage'
import { useAuthState } from './shared/hooks/useAuthState'

class AppErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null }
  static getDerivedStateFromError(error: Error) { return { error } }
  componentDidCatch(error: Error, info: ErrorInfo) { console.error('[AppErrorBoundary]', error, info) }
  render() {
    if (this.state.error) {
      return (
        <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-8 text-center">
          <p className="text-h3 text-text">Что-то пошло не так</p>
          <p className="text-body-sm text-text-muted">{(this.state.error as Error).message}</p>
          <button type="button" className="rounded-control border border-border bg-surface px-4 py-2 text-body-sm" onClick={() => window.location.reload()}>Перезагрузить</button>
        </div>
      )
    }
    return this.props.children
  }
}

const ArchivePage = lazy(() => import('./pages/archive/ArchivePage').then((module) => ({ default: module.ArchivePage })))
const AgendaPage = lazy(() => import('./pages/agenda/AgendaPage').then((module) => ({ default: module.AgendaPage })))
const BoardsPage = lazy(() => import('./pages/boards/BoardsPage').then((module) => ({ default: module.BoardsPage })))
const CalendarPage = lazy(() => import('./pages/calendar/CalendarPage').then((module) => ({ default: module.CalendarPage })))

export default function App() {
  const { user, token, login, logout, updateUser } = useAuthState()

  return (
    <AppErrorBoundary>
    <Routes>
      <Route path="/login" element={<LoginPage onLogin={login} token={token} />} />
      <Route path="/register" element={<RegisterPage user={user} />} />
      <Route
        element={
          <ProtectedRoute token={token} user={user} onInvalidSession={logout}>
            <AppShell user={user!} onLogout={logout} />
          </ProtectedRoute>
        }
      >
        <Route path="/" element={<BoardsPage />} />
        <Route path="/settings" element={user ? <SettingsPage user={user} onUserUpdate={updateUser} onLogout={logout} /> : null} />
        <Route path="/today" element={user ? <AgendaPage user={user} /> : null} />
        <Route path="/lists/:listId" element={user ? <AgendaPage user={user} /> : null} />
        <Route path="/lists/:listId/tasks/:taskId" element={user ? <AgendaPage user={user} /> : null} />
        <Route path="/calendar" element={<CalendarPage />} />
        <Route path="/archive" element={<ArchivePage />} />
        <Route path="*" element={<LegacyRedirect />} />
      </Route>
    </Routes>
    </AppErrorBoundary>
  )
}

function LegacyRedirect() {
  const location = useLocation()
  const target = resolveLegacyRedirect(location.pathname, location.hash)
  return <Navigate to={target ?? '/'} replace />
}
