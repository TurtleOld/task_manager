import { forwardRef } from 'react'
import type { ButtonHTMLAttributes } from 'react'
import { cn } from '../lib/cn'

type IconButtonVariant = 'neutral' | 'primary' | 'danger'

const iconButtonVariants: Record<IconButtonVariant, string> = {
  neutral: 'border-border bg-surface text-text-muted hover:border-border-strong hover:bg-surface-hover hover:text-text',
  primary: 'border-primary/25 bg-primary/10 text-primary hover:bg-primary/15',
  danger: 'border-danger/25 bg-danger/10 text-danger hover:bg-danger/15',
}

type IconButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: IconButtonVariant
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { className, type = 'button', variant = 'neutral', ...props },
  ref
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(
        'inline-flex min-h-10 min-w-10 items-center justify-center rounded-control border text-button transition-colors duration-fast ease-standard disabled:cursor-not-allowed disabled:bg-disabled-bg disabled:text-disabled-text',
        iconButtonVariants[variant],
        className
      )}
      {...props}
    />
  )
})
