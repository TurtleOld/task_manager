import { useState } from 'react'
import OneSignal from 'react-onesignal'
import { AUTH_TOKEN_KEY, clearAuth, loadAuthUser, registerOneSignalPlayerId, storeAuth } from '../../app/auth'
import type { AuthUser } from '../../api/types'

export function useAuthState() {
  const [user, setUser] = useState<AuthUser | null>(() => loadAuthUser())
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(AUTH_TOKEN_KEY))

  const login = (next: AuthUser) => {
    storeAuth(next)
    setUser(next)
    setToken(next.token)
    try {
      OneSignal.Slidedown.promptPush()
    } catch {
      // not critical
    }
    void registerOneSignalPlayerId()
  }

  const logout = () => {
    clearAuth()
    setUser(null)
    setToken(null)
  }

  const updateUser = (next: AuthUser) => {
    storeAuth(next)
    setUser(next)
  }

  return { user, token, login, logout, updateUser }
}
