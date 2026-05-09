import { useEffect } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import OneSignal from 'react-onesignal'
import { ProtectedRoute } from './app/ProtectedRoute'
import { registerOneSignalPlayerId } from './app/auth'
import { LoginPage } from './pages/auth/LoginPage'
import { RegisterPage } from './pages/auth/RegisterPage'
import { BoardPage } from './pages/board/BoardPage'
import { BoardsPage } from './pages/boards/BoardsPage'
import { SettingsPage } from './pages/settings/SettingsPage'
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
        path="/settings"
        element={
          <ProtectedRoute token={token}>
            {user ? <SettingsPage user={user} onLogout={logout} onUserUpdate={updateUser} /> : null}
          </ProtectedRoute>
        }
      />
      <Route
        path="/"
        element={
          <ProtectedRoute token={token}>
            {user ? <BoardsPage user={user} onLogout={logout} /> : null}
          </ProtectedRoute>
        }
      />
      <Route
        path="/boards/:id"
        element={
          <ProtectedRoute token={token}>
            {user ? <BoardPage onLogout={logout} user={user} /> : null}
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
