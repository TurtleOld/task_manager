import type { ElementType, HTMLAttributes } from 'react'
import { cn } from '../lib/cn'

type CardVariant = 'default' | 'elevated' | 'interactive'

const cardVariants: Record<CardVariant, string> = {
  default: 'border-border bg-surface shadow-surface',
  elevated: 'border-border bg-surface-elevated shadow-elevated',
  interactive: 'border-border bg-surface shadow-surface transition duration-fast ease-standard hover:border-primary/60 hover:shadow-elevated',
}

type CardProps = HTMLAttributes<HTMLElement> & {
  as?: ElementType
  variant?: CardVariant
}

export function Card({ as: Component = 'div', className, variant = 'default', ...props }: CardProps) {
  return (
    <Component
      className={cn('rounded-panel border p-6', cardVariants[variant], className)}
      {...props}
    />
  )
}
