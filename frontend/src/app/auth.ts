import type { AuthUser } from '../api/types'

// Only a profile cache for launching offline: whether someone is signed in is
// decided by GET /auth/me/, and the session itself lives in an HttpOnly cookie.
export const AUTH_USER_KEY = 'auth_user'
export const LANGUAGE_KEY = 'interface_language'
const LEGACY_TOKEN_KEY = 'auth_token'

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
  localStorage.setItem(AUTH_USER_KEY, JSON.stringify(user))
}

export function forgetAuthUser() {
  localStorage.removeItem(AUTH_USER_KEY)
}

export function dropLegacyToken(): boolean {
  const hadToken = localStorage.getItem(LEGACY_TOKEN_KEY) !== null
  localStorage.removeItem(LEGACY_TOKEN_KEY)
  return hadToken
}

export function loadLanguagePreference() {
  return localStorage.getItem(LANGUAGE_KEY) || 'ru'
}
