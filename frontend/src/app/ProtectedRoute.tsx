import { useEffect } from 'react'
import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import type { AuthUser } from '../api/types'

interface ProtectedRouteProps {
  token: string | null
  user?: AuthUser | null
  onInvalidSession?: () => void
  children: ReactNode
}

export function ProtectedRoute({ token, user, onInvalidSession, children }: ProtectedRouteProps) {
  const location = useLocation()
  useEffect(() => {
    if (token && user === null) onInvalidSession?.()
  }, [onInvalidSession, token, user])

  if (!token) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }
  if (user === null) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }
  return <>{children}</>
}
