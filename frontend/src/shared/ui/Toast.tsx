import type { ReactNode } from 'react'
import { Button } from './Button'
import { cn } from '@/lib/utils'

type ToastTone = 'info' | 'success' | 'warning' | 'error'

const toastTones: Record<ToastTone, string> = {
  info: 'border-info/25 bg-[image:var(--gradient-surface)] text-text',
  success: 'border-success/25 bg-[image:var(--gradient-surface)] text-text',
  warning: 'border-warning/30 bg-[image:var(--gradient-surface)] text-text',
  error: 'border-danger/30 bg-[image:var(--gradient-surface)] text-text',
}

type ToastProps = {
  action?: {
    label: string
    loading?: boolean
    onClick: () => void
  }
  children: ReactNode
  className?: string
  onClose: () => void
  tone?: ToastTone
}

export function Toast({
  action,
  children,
  className,
  onClose,
  tone = 'info',
}: ToastProps) {
  const liveMode = tone === 'error' || tone === 'warning' ? 'assertive' : 'polite'
  const role = tone === 'error' || tone === 'warning' ? 'alert' : 'status'

  return (
    <div className="fixed bottom-4 left-1/2 z-toast w-[min(760px,calc(100%-2rem))] -translate-x-1/2">
      <div
        className={cn(
          'rounded-overlay border px-4 py-3 shadow-overlay backdrop-blur',
          toastTones[tone],
          className,
        )}
        role={role}
        aria-live={liveMode}
      >
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-body-sm font-medium">{children}</div>
          <div className="flex items-center gap-2">
            {action ? (
              <Button
                type="button"
                size="sm"
                variant="secondary"
                loading={action.loading}
                onClick={action.onClick}
              >
                {action.label}
              </Button>
            ) : null}
            <Button type="button" size="sm" variant="ghost" onClick={onClose}>
              Закрыть
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
