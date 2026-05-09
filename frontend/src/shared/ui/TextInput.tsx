import { forwardRef } from 'react'
import type { InputHTMLAttributes } from 'react'
import { cn } from '../lib/cn'

type TextInputProps = InputHTMLAttributes<HTMLInputElement> & {
  fullWidth?: boolean
  invalid?: boolean
}

export const TextInput = forwardRef<HTMLInputElement, TextInputProps>(function TextInput(
  { className, disabled, fullWidth = true, invalid = false, ...props },
  ref
) {
  return (
    <input
      ref={ref}
      disabled={disabled}
      aria-invalid={invalid || undefined}
      className={cn(
        'min-h-11 rounded-control border border-border/90 bg-surface/90 px-4 py-2.5 text-body-sm text-text shadow-surface backdrop-blur transition duration-fast ease-standard',
        'placeholder:text-text-muted/90 disabled:cursor-not-allowed disabled:border-border disabled:bg-disabled-bg disabled:text-disabled-text',
        fullWidth && 'w-full',
        invalid ? 'border-danger/80 bg-danger/5' : 'hover:border-border-strong focus:border-primary/50',
        className
      )}
      {...props}
    />
  )
})
