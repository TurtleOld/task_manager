import { useId } from 'react'
import type { ReactNode } from 'react'
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

type ModalProps = {
  children: ReactNode
  className?: string
  footer?: ReactNode
  labelledBy?: string
  onClose: () => void
  open: boolean
  title: ReactNode
}

export function Modal({
  children,
  className,
  footer,
  labelledBy,
  onClose,
  open,
  title,
}: ModalProps) {
  const generatedTitleId = useId()
  const titleId = labelledBy ?? generatedTitleId

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose()
      }}
    >
      <DialogContent
        showCloseButton={false}
        aria-labelledby={titleId}
        className={cn(
          'w-full rounded-overlay border border-border/80 bg-[image:var(--gradient-surface)] p-6 shadow-overlay backdrop-blur',
          'translate-x-[-50%] translate-y-[-50%]',
          'data-[state=open]:animate-modal-content',
          className?.includes('max-w-') ? null : 'max-w-lg',
          className,
        )}
      >
        <div className="flex items-start justify-between gap-4">
          <DialogTitle
            id={titleId}
            className="min-w-0 flex-1 break-words text-h3 text-text"
          >
            {title}
          </DialogTitle>
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрыть окно"
            className="inline-flex min-h-10 items-center justify-center rounded-control px-3.5 py-2 text-caption font-semibold text-text-muted hover:bg-background-subtle hover:text-text"
          >
            x
          </button>
        </div>
        <div className="mt-4">{children}</div>
        {footer ? (
          <div className="mt-6 flex flex-wrap justify-end gap-2">{footer}</div>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
