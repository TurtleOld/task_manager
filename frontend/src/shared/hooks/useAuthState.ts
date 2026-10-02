import { useEffect, useState } from 'react'
import { AUTH_TOKEN_KEY, loadAuthUser, storeAuth } from '../../app/auth'
import { clearLocalSession, onSessionCleared } from '../../app/session'
import type { AuthUser } from '../../api/types'

export function useAuthState() {
  const [user, setUser] = useState<AuthUser | null>(() => loadAuthUser())
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(AUTH_TOKEN_KEY))

  const login = (next: AuthUser) => {
    storeAuth(next)
    setUser(next)
    setToken(next.token)
  }

  useEffect(
    () =>
      onSessionCleared(() => {
        setUser(null)
        setToken(null)
      }),
    [],
  )

  const logout = () => {
    void clearLocalSession()
  }

  const updateUser = (next: AuthUser) => {
    storeAuth(next)
    setUser(next)
  }

  return { user, token, login, logout, updateUser }
}
