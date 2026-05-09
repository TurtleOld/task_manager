import { forwardRef } from 'react'
import type { InputHTMLAttributes, ReactNode } from 'react'
import { cn } from '../lib/cn'

type RadioCardProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & {
  checked?: boolean
  description?: ReactNode
  label: ReactNode
}

export const RadioCard = forwardRef<HTMLInputElement, RadioCardProps>(function RadioCard(
  { checked = false, className, description, disabled, label, ...props },
  ref
) {
  return (
    <label
      className={cn(
        'flex items-start gap-3 rounded-control border px-3.5 py-3 text-body-sm backdrop-blur transition duration-fast ease-standard',
        checked ? 'border-primary/35 bg-primary/10 text-text shadow-surface' : 'border-border bg-surface/90 text-text',
        disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer hover:border-primary/30 hover:bg-surface-hover',
        className
      )}
    >
      <input ref={ref} type="radio" checked={checked} disabled={disabled} className="mt-0.5 h-4 w-4 text-primary" {...props} />
      <span>
        <span className="block font-semibold">{label}</span>
        {description ? <span className="mt-1 block text-caption text-text-muted">{description}</span> : null}
      </span>
    </label>
  )
})
