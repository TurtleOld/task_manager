import { useEffect } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import OneSignal from 'react-onesignal'
import { AppPlaceholderPage } from './app/AppPlaceholderPage'
import { AppShell } from './app/AppShell'
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
        <Route path="/today" element={<AppPlaceholderPage taskId="T-202" title="Мой день" description="Агрегированный список задач на сегодня появится на следующей фазе ценности для семьи." />} />
        <Route path="/calendar" element={<AppPlaceholderPage taskId="T-203" title="Календарь" description="Календарный вид задач с дедлайнами будет реализован отдельной задачей плана." />} />
        <Route path="/inbox" element={<AppPlaceholderPage taskId="T-204" title="Inbox" description="Быстрый сбор неразобранных задач будет добавлен после каркаса приложения." />} />
        <Route path="/archive" element={<AppPlaceholderPage taskId="T-205" title="Архив" description="Архив задач и колонок появится вместе с soft-delete моделью." />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
