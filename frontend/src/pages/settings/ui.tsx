import type { ReactNode } from 'react'
import clsx from 'clsx'

/** Раздел настроек: заголовок с пояснением и одна карточка со строками. */
export function SettingsSection({
  id,
  title,
  description,
  action,
  children,
}: {
  id: string
  title: string
  description?: string
  action?: ReactNode
  children: ReactNode
}) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-28">
      <div className="mb-3 flex items-end justify-between gap-4">
        <div className="min-w-0">
          <h2 id={`${id}-title`} className="text-body font-semibold text-text">
            {title}
          </h2>
          {description ? <p className="mt-0.5 text-body-sm text-text-muted">{description}</p> : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      <div className="divide-y divide-border/60 rounded-panel bg-surface-elevated shadow-surface">{children}</div>
    </section>
  )
}

/** Строка настройки: что это и зачем — слева, управление — справа. */
export function SettingsRow({
  label,
  description,
  htmlFor,
  children,
  stacked = false,
}: {
  label: ReactNode
  description?: ReactNode
  htmlFor?: string
  children?: ReactNode
  /** Управление под подписью, а не справа: для широких полей и списков. */
  stacked?: boolean
}) {
  const Label = htmlFor ? 'label' : 'div'
  return (
    <div className={clsx('flex gap-x-6 gap-y-3 px-5 py-4', stacked ? 'flex-col' : 'flex-col sm:flex-row sm:items-center')}>
      <div className="min-w-0 flex-1">
        <Label {...(htmlFor ? { htmlFor } : {})} className="block text-body-sm font-medium text-text">
          {label}
        </Label>
        {description ? <div className="mt-0.5 text-body-sm text-text-muted">{description}</div> : null}
      </div>
      {children != null ? <div className={clsx('min-w-0', stacked ? 'w-full' : 'sm:shrink-0')}>{children}</div> : null}
    </div>
  )
}

export function Switch({
  checked,
  onChange,
  label,
  id,
  disabled = false,
}: {
  checked: boolean
  onChange: (checked: boolean) => void
  label: string
  id?: string
  disabled?: boolean
}) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={clsx(
        'relative h-6 w-10 shrink-0 rounded-full transition-colors duration-normal ease-standard disabled:cursor-not-allowed disabled:opacity-50',
        checked ? 'bg-primary' : 'bg-border-strong',
      )}
    >
      <span
        className={clsx(
          'absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow-surface transition-transform duration-normal ease-entrance',
          checked && 'translate-x-4',
        )}
        aria-hidden="true"
      />
    </button>
  )
}

/** Тихий статус рядом с текстом: точка цвета и подпись, без пилюли. */
export function StatusDot({ tone, children }: { tone: 'success' | 'muted' | 'danger' | 'primary'; children: ReactNode }) {
  const dot = { success: 'bg-success', muted: 'bg-text-muted/50', danger: 'bg-danger', primary: 'bg-primary' }[tone]
  const text = { success: 'text-text-muted', muted: 'text-text-muted', danger: 'text-danger', primary: 'text-primary' }[tone]
  return (
    <span className={clsx('inline-flex items-center gap-1.5 text-caption font-normal', text)}>
      <span className={clsx('h-1.5 w-1.5 rounded-full', dot)} aria-hidden="true" />
      {children}
    </span>
  )
}

export function Initial({ name, size = 'md' }: { name: string; size?: 'md' | 'lg' }) {
  return (
    <span
      className={clsx(
        'flex shrink-0 items-center justify-center rounded-full bg-primary/15 font-bold text-primary',
        size === 'lg' ? 'h-12 w-12 text-body' : 'h-8 w-8 text-caption',
      )}
      aria-hidden="true"
    >
      {name[0]?.toUpperCase() ?? '?'}
    </span>
  )
}
