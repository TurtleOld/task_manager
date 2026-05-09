import OneSignal from 'react-onesignal'
import { api } from '../api/client'
import type { AuthUser } from '../api/types'

export const AUTH_TOKEN_KEY = 'auth_token'
export const AUTH_USER_KEY = 'auth_user'
export const LANGUAGE_KEY = 'interface_language'

export function loadAuthUser(): AuthUser | null {
  const raw = localStorage.getItem(AUTH_USER_KEY)
  if (!raw) return null
  try {
    return JSON.parse(raw) as AuthUser
  } catch {
    return null
  }
}

export function storeAuth(user: AuthUser) {
  localStorage.setItem(AUTH_TOKEN_KEY, user.token)
  localStorage.setItem(AUTH_USER_KEY, JSON.stringify(user))
}

export async function registerOneSignalPlayerId() {
  try {
    const playerId = OneSignal.User?.PushSubscription?.id
    if (playerId) {
      await api.updateNotificationProfile({ onesignal_player_id: playerId } as Record<string, string>)
    }
  } catch {
    // non-critical
  }
}

export function clearAuth() {
  localStorage.removeItem(AUTH_TOKEN_KEY)
  localStorage.removeItem(AUTH_USER_KEY)
}

export function loadLanguagePreference() {
  return localStorage.getItem(LANGUAGE_KEY) || 'ru'
}
