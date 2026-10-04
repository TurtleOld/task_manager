import { forwardRef } from 'react'
import type { ButtonHTMLAttributes, ReactNode } from 'react'
import clsx from 'clsx'
import { Check } from 'lucide-react'
import { priorityRing } from '../lib/taskFormat'

// clsx, not cn: tailwind-merge treats `text-body-sm` as a color and drops it next to `text-text`.

export type PropertyTone = 'set' | 'empty' | 'danger' | 'primary'

const propertyToneClass: Record<PropertyTone, string> = {
  set: 'text-text [&>svg]:text-text-muted',
  empty: 'text-text-muted/70',
  danger: 'text-danger',
  primary: 'text-primary',
}

export const propertyButtonClass =
  'inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-control px-2.5 text-body-sm transition duration-fast ease-standard hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-60 [&>svg]:h-4 [&>svg]:w-4 [&>svg]:shrink-0'

export const propertyPopoverClass = 'w-auto min-w-56 rounded-panel border-border/60 bg-surface-elevated p-1.5 shadow-overlay'

type PropertyButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { tone?: PropertyTone }

/** Одно свойство в строке под названием задачи: срок, исполнитель, приоритет, повтор. */
export const PropertyButton = forwardRef<HTMLButtonElement, PropertyButtonProps>(function PropertyButton(
  { className, tone = 'set', type = 'button', ...props },
  ref,
) {
  return <button ref={ref} type={type} className={clsx(propertyButtonClass, propertyToneClass[tone], className)} {...props} />
})

export function MenuOption({
  children,
  onSelect,
  selected = false,
}: {
  children: ReactNode
  onSelect: () => void
  selected?: boolean
}) {
  return (
    <button
      type="button"
      role="menuitemradio"
      aria-checked={selected}
      onClick={onSelect}
      className="flex w-full items-center gap-2.5 rounded-control px-2.5 py-2 text-left text-body-sm text-text transition hover:bg-surface-hover focus-visible:bg-surface-hover"
    >
      {children}
      {selected ? <Check className="ml-auto h-4 w-4 shrink-0 text-primary" aria-hidden="true" /> : null}
    </button>
  )
}

export function MenuHint({ children }: { children: ReactNode }) {
  return <p className="px-2.5 pb-1 pt-1.5 text-caption text-text-muted">{children}</p>
}

export function PriorityRing({ priority }: { priority: number | null | undefined }) {
  return <span className={clsx('h-3 w-3 shrink-0 rounded-full border-2', priorityRing(priority))} aria-hidden="true" />
}
