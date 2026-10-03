import { useEffect, useState } from 'react'
import { api } from '../../api/client'
import { dropLegacyToken, forgetAuthUser, loadAuthUser, storeAuth } from '../../app/auth'
import { clearLocalSession, deleteLegacyPushDb, markSignedIn, onSessionCleared } from '../../app/session'
import { registerExistingSubscription } from '../../lib/pushManager'
import type { AuthUser } from '../../api/types'

/** `user` is undefined until the server has said whether this browser has a session. */
export function useAuthState() {
  const [user, setUser] = useState<AuthUser | null | undefined>(undefined)

  useEffect(() => {
    const firstLaunchWithSessions = dropLegacyToken()
    void deleteLegacyPushDb().catch(() => undefined)

    let cancelled = false
    api.getCurrentUser().then(
      (current) => {
        if (cancelled) return
        if (current) {
          markSignedIn()
          storeAuth(current)
        } else if (loadAuthUser() && !firstLaunchWithSessions) {
          // The session ended while the app was closed. After the switch from
          // tokens nobody has one yet, and the push subscription must survive
          // so the next login can re-register it.
          void clearLocalSession()
        } else {
          forgetAuthUser()
        }
        setUser(current)
      },
      () => {
        // Offline launch: trust the cached profile, the first request that
        // reaches the server answers 401 if the session is gone.
        if (cancelled) return
        const cached = loadAuthUser()
        if (cached) markSignedIn()
        setUser(cached)
      },
    )
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => onSessionCleared(() => setUser(null)), [])

  const login = (next: AuthUser) => {
    markSignedIn()
    storeAuth(next)
    setUser(next)
    void registerExistingSubscription().catch(() => undefined)
  }

  const logout = async () => {
    try {
      await api.logout()
    } catch {
      // The local cleanup must run even offline.
    }
    await clearLocalSession()
  }

  const updateUser = (next: AuthUser) => {
    storeAuth(next)
    setUser(next)
  }

  return { user, login, logout, updateUser }
}
