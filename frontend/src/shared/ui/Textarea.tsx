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
        'w-full rounded-control border border-border/90 bg-surface/90 px-4 py-3 text-body-sm text-text shadow-surface backdrop-blur transition duration-fast ease-standard',
        'placeholder:text-text-muted disabled:cursor-not-allowed disabled:border-border disabled:bg-disabled-bg disabled:text-disabled-text',
        invalid ? 'border-danger/80 bg-danger/5' : 'hover:border-border-strong focus:border-primary/50',
        className
      )}
      {...props}
    />
  )
})
