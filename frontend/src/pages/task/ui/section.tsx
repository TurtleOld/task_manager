import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Plus } from 'lucide-react'

export function SectionHeading({ children, count }: { children: ReactNode; count?: ReactNode }) {
  return (
    <h3 className="mb-2 flex items-baseline gap-2 text-body-sm font-semibold text-text-muted">
      {children}
      {count != null ? <span className="font-normal tabular-nums text-text-muted/70">{count}</span> : null}
    </h3>
  )
}

/** Строка «+ Добавить …» в конце списка: поле ввода, Enter добавляет и оставляет фокус. */
export function AddRow({
  autoFocus = false,
  busy = false,
  label,
  onSubmit,
  placeholder,
}: {
  autoFocus?: boolean
  busy?: boolean
  label: string
  onSubmit: (text: string) => void
  placeholder: string
}) {
  const [value, setValue] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus()
  }, [autoFocus])

  return (
    <label className="-mx-2 flex min-h-10 cursor-text items-center gap-3 rounded-control px-2 text-text-muted/70 transition focus-within:bg-background-subtle focus-within:text-text-muted">
      <Plus className="mx-px h-4 w-4 shrink-0" aria-hidden="true" />
      <input
        ref={inputRef}
        value={value}
        aria-busy={busy || undefined}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key !== 'Enter') return
          event.preventDefault()
          const text = value.trim()
          if (!text) return
          onSubmit(text)
          setValue('')
        }}
        placeholder={placeholder}
        aria-label={label}
        className="min-w-0 flex-1 bg-transparent py-2 text-body text-text outline-none placeholder:text-text-muted/70 focus-visible:ring-0 focus-visible:ring-offset-0"
      />
    </label>
  )
}
