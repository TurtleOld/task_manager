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
        'min-h-11 rounded-control border bg-background-subtle px-4 py-2 text-body-sm text-text shadow-inner transition-colors duration-fast ease-standard',
        'placeholder:text-text-muted disabled:cursor-not-allowed disabled:border-border disabled:bg-disabled-bg disabled:text-disabled-text',
        fullWidth && 'w-full',
        invalid ? 'border-danger' : 'border-border hover:border-border-strong',
        className
      )}
      {...props}
    />
  )
})
