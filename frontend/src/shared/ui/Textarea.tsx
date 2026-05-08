import { forwardRef } from 'react'
import type { TextareaHTMLAttributes } from 'react'
import { cn } from '../lib/cn'

type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  invalid?: boolean
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { className, disabled, invalid = false, ...props },
  ref
) {
  return (
    <textarea
      ref={ref}
      disabled={disabled}
      aria-invalid={invalid || undefined}
      className={cn(
        'w-full rounded-control border bg-background-subtle px-4 py-2 text-body-sm text-text shadow-inner transition-colors duration-fast ease-standard',
        'placeholder:text-text-muted disabled:cursor-not-allowed disabled:border-border disabled:bg-disabled-bg disabled:text-disabled-text',
        invalid ? 'border-danger' : 'border-border hover:border-border-strong',
        className
      )}
      {...props}
    />
  )
})
