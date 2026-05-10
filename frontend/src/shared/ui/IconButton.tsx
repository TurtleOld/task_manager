import { forwardRef } from 'react'
import type { ButtonHTMLAttributes } from 'react'
import { Button as ShadcnButton } from '@/components/ui/button'
import { cn } from '@/lib/utils'

type IconButtonVariant = 'neutral' | 'primary' | 'danger'

const iconButtonVariants: Record<IconButtonVariant, string> = {
  neutral:
    'border-border bg-surface/90 text-text-muted shadow-surface backdrop-blur hover:border-border-strong hover:bg-surface-hover hover:text-text',
  primary:
    'border-primary/25 bg-primary/10 text-primary shadow-surface hover:bg-primary/15 hover:text-primary',
  danger:
    'border-danger/25 bg-danger/10 text-danger shadow-surface hover:bg-danger/15 hover:text-danger',
}

type IconButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: IconButtonVariant
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { className, type = 'button', variant = 'neutral', ...props },
  ref,
) {
  return (
    <ShadcnButton
      ref={ref}
      type={type}
      variant="outline"
      size="icon"
      className={cn(
        'min-h-10 min-w-10 rounded-control border text-button transition duration-fast ease-standard disabled:cursor-not-allowed disabled:bg-disabled-bg disabled:text-disabled-text',
        iconButtonVariants[variant],
        className,
      )}
      {...props}
    />
  )
})
