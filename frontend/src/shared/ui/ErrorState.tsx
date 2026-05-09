import type { ReactNode } from 'react'
import { Button } from './Button'
import { cn } from '../lib/cn'

type ErrorStateProps = {
  action?: {
    label: string
    onClick: () => void
  }
  children?: ReactNode
  className?: string
  title?: ReactNode
}

export function ErrorState({ action, children, className, title = 'Что-то пошло не так' }: ErrorStateProps) {
  return (
    <div className={cn('rounded-[1.25rem] border border-danger/25 bg-danger/10 p-6 text-danger shadow-surface backdrop-blur', className)} role="alert">
      <h2 className="text-h3">{title}</h2>
      {children ? <div className="mt-2 text-body-sm text-danger/90">{children}</div> : null}
      {action ? (
        <Button type="button" variant="danger" onClick={action.onClick} className="mt-4">
          {action.label}
        </Button>
      ) : null}
    </div>
  )
}
