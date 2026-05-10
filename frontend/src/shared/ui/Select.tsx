import { forwardRef } from 'react'
import type { SelectHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & {
  fullWidth?: boolean
  invalid?: boolean
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { className, disabled, fullWidth = true, invalid = false, ...props },
  ref
) {
  return (
    <select
      ref={ref}
      disabled={disabled}
      aria-invalid={invalid || undefined}
      className={cn(
        'min-h-11 rounded-control border border-border/90 bg-surface/90 px-3.5 py-2.5 text-body-sm text-text shadow-surface backdrop-blur transition duration-fast ease-standard',
        'placeholder:text-text-muted disabled:cursor-not-allowed disabled:border-border disabled:bg-disabled-bg disabled:text-disabled-text',
        fullWidth && 'w-full',
        invalid ? 'border-danger/80 bg-danger/5' : 'hover:border-border-strong focus:border-primary/50',
        className
      )}
      {...props}
    />
  )
})
