import { forwardRef } from 'react'
import type { ButtonHTMLAttributes } from 'react'
import { Button as ShadcnButton } from '@/components/ui/button'
import { cn } from '@/lib/utils'

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'link'
type ButtonSize = 'sm' | 'md'
type ButtonShape = 'default' | 'pill' | 'none'

const variantMap: Record<ButtonVariant, 'default' | 'secondary' | 'ghost' | 'destructive' | 'link'> = {
  primary: 'default',
  secondary: 'secondary',
  ghost: 'ghost',
  danger: 'destructive',
  link: 'link',
}

const sizeMap: Record<ButtonSize, 'default' | 'sm'> = {
  sm: 'sm',
  md: 'default',
}

// Keep the visual identity of the legacy Button (gradient primary, pill shape, etc.).
// Variants below layer extra classes on top of shadcn's variants.
const variantOverrides: Record<ButtonVariant, string> = {
  primary: 'bg-[image:var(--gradient-primary)] text-text-inverse shadow-elevated hover:brightness-[1.03] active:brightness-95',
  secondary: 'border border-border bg-surface/90 text-text shadow-surface backdrop-blur hover:border-border-strong hover:bg-surface-hover',
  ghost: 'text-text-muted hover:bg-background-subtle hover:text-text',
  danger: 'border border-danger/25 bg-danger/8 text-danger shadow-surface hover:border-danger/40 hover:bg-danger/12 hover:text-danger',
  link: 'min-h-0 rounded-none px-0 py-0 text-primary underline-offset-4 hover:text-primary-hover hover:underline',
}

const sizeOverrides: Record<ButtonSize, string> = {
  sm: 'min-h-10 px-3.5 py-2 text-caption',
  md: 'min-h-11 px-4.5 py-2.5 text-button',
}

const shapeClasses: Record<ButtonShape, string> = {
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
  ref,
) {
  const isDisabled = disabled || loading
  return (
    <ShadcnButton
      ref={ref}
      type={type}
      variant={variantMap[variant]}
      size={sizeMap[size]}
      disabled={isDisabled}
      aria-busy={loading || undefined}
      className={cn(
        'font-semibold transition duration-fast ease-standard ring-1 ring-transparent',
        'disabled:cursor-not-allowed disabled:bg-disabled-bg disabled:text-disabled-text disabled:shadow-none disabled:ring-0',
        variant !== 'link' && sizeOverrides[size],
        shapeClasses[shape],
        variantOverrides[variant],
        fullWidth && 'w-full',
        className,
      )}
      {...props}
    >
      {loading ? 'Загрузка...' : children}
    </ShadcnButton>
  )
})
