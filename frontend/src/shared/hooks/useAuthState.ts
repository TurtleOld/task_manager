import { useCallback, useEffect, useState } from 'react'
import { AUTH_TOKEN_KEY, clearAuth, loadAuthUser, storeAuth } from '../../app/auth'
import { setSessionExpiredHandler } from '../../app/session'
import type { AuthUser } from '../../api/types'

export function useAuthState() {
  const [user, setUser] = useState<AuthUser | null>(() => loadAuthUser())
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(AUTH_TOKEN_KEY))

  const login = (next: AuthUser) => {
    storeAuth(next)
    setUser(next)
    setToken(next.token)
  }

  const logout = useCallback(() => {
    clearAuth()
    setUser(null)
    setToken(null)
  }, [])

  useEffect(() => {
    setSessionExpiredHandler(logout)
    return () => setSessionExpiredHandler(null)
  }, [logout])

  const updateUser = (next: AuthUser) => {
    storeAuth(next)
    setUser(next)
  }

  return { user, token, login, logout, updateUser }
}
