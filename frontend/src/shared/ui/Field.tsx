import type { ReactNode } from 'react'
import { cn } from '../lib/cn'

type FieldProps = {
  children: ReactNode
  className?: string
  error?: ReactNode
  errorId?: string
  hint?: ReactNode
  hintId?: string
  label: ReactNode
  htmlFor?: string
}

export function Field({ children, className, error, errorId, hint, hintId, htmlFor, label }: FieldProps) {
  return (
    <div className={cn('space-y-2', className)}>
      <label htmlFor={htmlFor} className="block text-label uppercase text-text-muted">
        {label}
      </label>
      {children}
      {hint ? <p id={hintId} className="text-caption text-text-muted">{hint}</p> : null}
      {error ? <p id={errorId} className="text-body-sm text-danger">{error}</p> : null}
    </div>
  )
}
