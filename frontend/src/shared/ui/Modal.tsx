import { useEffect, useId, useRef } from 'react'
import type { ReactNode } from 'react'
import { Button } from './Button'
import { cn } from '../lib/cn'

type ModalProps = {
  children: ReactNode
  className?: string
  footer?: ReactNode
  labelledBy?: string
  onClose: () => void
  open: boolean
  title: ReactNode
}

export function Modal({ children, className, footer, labelledBy, onClose, open, title }: ModalProps) {
  const generatedTitleId = useId()
  const closeRef = useRef(onClose)
  const dialogRef = useRef<HTMLDivElement | null>(null)
  const titleId = labelledBy ?? generatedTitleId

  useEffect(() => {
    closeRef.current = onClose
  }, [onClose])

  useEffect(() => {
    if (!open) return

    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null

    const getFocusableElements = () => {
      const dialog = dialogRef.current
      if (!dialog) return []

      return Array.from(
        dialog.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )
      ).filter((element) => {
        const style = window.getComputedStyle(element)
        return !element.hasAttribute('hidden') && style.display !== 'none' && style.visibility !== 'hidden'
      })
    }

    const focusFirstElement = () => {
      const [first] = getFocusableElements()
      ;(first ?? dialogRef.current)?.focus()
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeRef.current()
        return
      }

      if (event.key !== 'Tab') return

      const focusableElements = getFocusableElements()
      if (!focusableElements.length) {
        event.preventDefault()
        dialogRef.current?.focus()
        return
      }

      const first = focusableElements[0]
      const last = focusableElements[focusableElements.length - 1]
      if (!first || !last) return

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    focusFirstElement()
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      previouslyFocused?.focus()
    }
  }, [open])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-modal flex items-center justify-center bg-slate-950/60 backdrop-blur-sm p-4">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={cn('w-full max-w-lg rounded-overlay border border-border/80 bg-[image:var(--gradient-surface)] p-6 shadow-overlay backdrop-blur', className)}
      >
        <div className="flex items-start justify-between gap-4">
          <h2 id={titleId} className="text-h3 text-text">{title}</h2>
          <Button type="button" variant="ghost" size="sm" onClick={onClose} aria-label="Закрыть окно">
            x
          </Button>
        </div>
        <div className="mt-4">{children}</div>
        {footer ? <div className="mt-6 flex flex-wrap justify-end gap-2">{footer}</div> : null}
      </div>
    </div>
  )
}
