import { useEffect } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import OneSignal from 'react-onesignal'
import { AppShell } from './app/AppShell'
import { ProtectedRoute } from './app/ProtectedRoute'
import { registerOneSignalPlayerId } from './app/auth'
import { ArchivePage } from './pages/archive/ArchivePage'
import { LoginPage } from './pages/auth/LoginPage'
import { RegisterPage } from './pages/auth/RegisterPage'
import { BoardPage } from './pages/board/BoardPage'
import { BoardsPage } from './pages/boards/BoardsPage'
import { CalendarPage } from './pages/calendar/CalendarPage'
import { InboxPage } from './pages/inbox/InboxPage'
import { SettingsPage } from './pages/settings/SettingsPage'
import { TodayPage } from './pages/today/TodayPage'
import { useAuthState } from './shared/hooks/useAuthState'

export default function App() {
  const { user, token, login, logout, updateUser } = useAuthState()

  useEffect(() => {
    if (!token) return
    // Register player_id on app mount (if already logged in) and on subscription changes
    void registerOneSignalPlayerId()
    const handler = () => void registerOneSignalPlayerId()
    try {
      OneSignal.User?.PushSubscription?.addEventListener?.('change', handler)
    } catch { /* not critical */ }
    return () => {
      try {
        OneSignal.User?.PushSubscription?.removeEventListener?.('change', handler)
      } catch { /* not critical */ }
    }
  }, [token])

  return (
    <Routes>
      <Route path="/login" element={<LoginPage onLogin={login} token={token} />} />
      <Route path="/register" element={<RegisterPage user={user} />} />
      <Route
        element={
          <ProtectedRoute token={token}>
            {user ? <AppShell user={user} onLogout={logout} /> : null}
          </ProtectedRoute>
        }
      >
        <Route path="/" element={<BoardsPage />} />
        <Route path="/settings" element={user ? <SettingsPage user={user} onUserUpdate={updateUser} /> : null} />
        <Route path="/boards/:id" element={user ? <BoardPage user={user} /> : null} />
        <Route path="/boards/:id/cards/:cardId" element={user ? <BoardPage user={user} /> : null} />
        <Route path="/today" element={<TodayPage />} />
        <Route path="/calendar" element={<CalendarPage />} />
        <Route path="/inbox" element={<InboxPage />} />
        <Route path="/archive" element={<ArchivePage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
