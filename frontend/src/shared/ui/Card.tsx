import type { ElementType, HTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

type CardVariant = 'default' | 'elevated' | 'interactive'

const cardVariants: Record<CardVariant, string> = {
  default: 'border-border/90 bg-[image:var(--gradient-surface)] shadow-surface backdrop-blur',
  elevated: 'border-border/80 bg-surface-elevated shadow-elevated backdrop-blur',
  interactive:
    'border-border/90 bg-[image:var(--gradient-surface)] shadow-surface backdrop-blur transition duration-fast ease-standard hover:-translate-y-0.5 hover:border-primary/35 hover:shadow-elevated',
}

type CardProps = HTMLAttributes<HTMLElement> & {
  as?: ElementType
  variant?: CardVariant
}

export function Card({
  as: Component = 'div',
  className,
  variant = 'default',
  ...props
}: CardProps) {
  return (
    <Component
      className={cn('rounded-panel border p-6', cardVariants[variant], className)}
      {...props}
    />
  )
}
