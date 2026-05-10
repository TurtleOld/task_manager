import type { ReactNode } from 'react'
import { Button } from './Button'
import { cn } from '@/lib/utils'

type EmptyStateProps = {
  action?: {
    label: string
    onClick: () => void
  }
  children?: ReactNode
  className?: string
  title: ReactNode
}

export function EmptyState({ action, children, className, title }: EmptyStateProps) {
  return (
    <div
      className={cn(
        'rounded-[1.15rem] border border-dashed border-border bg-background-subtle/55 p-6 text-center backdrop-blur',
        className,
      )}
    >
      <h2 className="text-h3 text-text">{title}</h2>
      {children ? (
        <div className="mt-2 text-body-sm text-text-muted">{children}</div>
      ) : null}
      {action ? (
        <Button type="button" onClick={action.onClick} className="mt-4">
          {action.label}
        </Button>
      ) : null}
    </div>
  )
}
