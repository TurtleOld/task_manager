import { forwardRef } from 'react'
import type { InputHTMLAttributes, ReactNode } from 'react'
import { cn } from '../lib/cn'

type CheckboxProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & {
  description?: ReactNode
  label: ReactNode
}

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox(
  { className, description, disabled, label, ...props },
  ref
) {
  return (
    <label
      className={cn(
        'flex items-start gap-3 rounded-control border border-border bg-surface px-3 py-2 text-body-sm text-text transition-colors duration-fast ease-standard',
        disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer hover:border-border-strong hover:bg-surface-hover',
        className
      )}
    >
      <input
        ref={ref}
        type="checkbox"
        disabled={disabled}
        className="mt-0.5 h-4 w-4 rounded border-border text-primary"
        {...props}
      />
      <span>
        <span className="block font-semibold">{label}</span>
        {description ? <span className="mt-1 block text-caption text-text-muted">{description}</span> : null}
      </span>
    </label>
  )
})
