import type { ReactNode } from 'react'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

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

export function Field({
  children,
  className,
  error,
  errorId,
  hint,
  hintId,
  htmlFor,
  label,
}: FieldProps) {
  return (
    <div className={cn('space-y-2', className)}>
      <Label
        htmlFor={htmlFor}
        className="block text-label uppercase tracking-[0.08em] text-text-muted"
      >
        {label}
      </Label>
      {children}
      {hint ? (
        <p id={hintId} className="text-caption text-text-muted">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className="text-body-sm text-danger">
          {error}
        </p>
      ) : null}
    </div>
  )
}
