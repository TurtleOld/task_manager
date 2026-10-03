import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import type { AuthUser } from '../api/types'

interface ProtectedRouteProps {
  user: AuthUser | null | undefined
  children: ReactNode
}

export function ProtectedRoute({ user, children }: ProtectedRouteProps) {
  const location = useLocation()
  if (user === undefined) return null
  if (user === null) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }
  return <>{children}</>
}
