import { forwardRef } from 'react'
import type { ButtonHTMLAttributes } from 'react'
import { cn } from '../lib/cn'

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'link'
type ButtonSize = 'sm' | 'md'
type ButtonShape = 'default' | 'pill' | 'none'

const buttonVariants: Record<ButtonVariant, string> = {
  primary: 'bg-primary text-text-inverse shadow-surface hover:bg-primary-hover active:bg-primary-active',
  secondary: 'border border-border bg-surface text-text shadow-surface hover:border-border-strong hover:bg-surface-hover',
  ghost: 'text-text-muted hover:bg-surface-hover hover:text-text',
  danger: 'border border-danger/30 bg-surface text-danger shadow-surface hover:bg-danger/10',
  link: 'min-h-0 rounded-none px-0 py-0 text-primary underline-offset-4 hover:text-primary-hover hover:underline',
}

const buttonSizes: Record<ButtonSize, string> = {
  sm: 'min-h-10 px-3 py-2 text-caption',
  md: 'min-h-11 px-4 py-2 text-button',
}

const buttonShapes: Record<ButtonShape, string> = {
  default: 'rounded-control',
  pill: 'rounded-full',
  none: 'rounded-none',
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant
  size?: ButtonSize
  fullWidth?: boolean
  loading?: boolean
  shape?: ButtonShape
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    children,
    className,
    disabled,
    fullWidth = false,
    loading = false,
    size = 'md',
    type = 'button',
    variant = 'primary',
    shape = variant === 'link' ? 'none' : 'default',
    ...props
  },
  ref
) {
  const isDisabled = disabled || loading

  return (
    <button
      ref={ref}
      type={type}
      disabled={isDisabled}
      aria-busy={loading || undefined}
      className={cn(
        'inline-flex items-center justify-center gap-2 font-semibold transition-colors duration-fast ease-standard',
        'disabled:cursor-not-allowed disabled:bg-disabled-bg disabled:text-disabled-text disabled:shadow-none',
        variant !== 'link' && buttonSizes[size],
        buttonShapes[shape],
        buttonVariants[variant],
        fullWidth && 'w-full',
        className
      )}
      {...props}
    >
      {loading ? 'Загрузка...' : children}
    </button>
  )
})
