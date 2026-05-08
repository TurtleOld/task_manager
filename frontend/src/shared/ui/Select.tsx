import { forwardRef } from 'react'
import type { SelectHTMLAttributes } from 'react'
import { cn } from '../lib/cn'

type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & {
  invalid?: boolean
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { className, disabled, invalid = false, ...props },
  ref
) {
  return (
    <select
      ref={ref}
      disabled={disabled}
      aria-invalid={invalid || undefined}
      className={cn(
        'min-h-11 w-full rounded-control border bg-surface px-3 py-2 text-body-sm text-text shadow-inner transition-colors duration-fast ease-standard',
        'placeholder:text-text-muted disabled:cursor-not-allowed disabled:border-border disabled:bg-disabled-bg disabled:text-disabled-text',
        invalid ? 'border-danger' : 'border-border hover:border-border-strong',
        className
      )}
      {...props}
    />
  )
})
