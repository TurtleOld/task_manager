import { forwardRef, useId } from 'react'
import type { ChangeEvent, InputHTMLAttributes, ReactNode } from 'react'
import { Checkbox as ShadcnCheckbox } from '@/components/ui/checkbox'
import { cn } from '@/lib/utils'

type CheckboxProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'onChange' | 'checked'> & {
  description?: ReactNode
  label: ReactNode
  checked?: boolean
  onChange?: (event: ChangeEvent<HTMLInputElement>) => void
}

export const Checkbox = forwardRef<HTMLButtonElement, CheckboxProps>(function Checkbox(
  { className, description, disabled, label, id, checked, onChange, name, value },
  ref,
) {
  const generatedId = useId()
  const inputId = id ?? generatedId
  return (
    <label
      htmlFor={inputId}
      className={cn(
        'flex items-start gap-3 rounded-control border border-border bg-surface px-3 py-2 text-body-sm text-text transition-colors duration-fast ease-standard',
        disabled
          ? 'cursor-not-allowed opacity-60'
          : 'cursor-pointer hover:border-border-strong hover:bg-surface-hover',
        className,
      )}
    >
      <ShadcnCheckbox
        ref={ref}
        id={inputId}
        name={name}
        value={value as string | undefined}
        checked={checked}
        disabled={disabled}
        onCheckedChange={(next) => {
          if (!onChange) return
          // Synthesize a minimal ChangeEvent shape so legacy callsites that read
          // event.target.checked keep working.
          const synthetic = {
            target: {
              checked: next === true,
              name: name ?? '',
              value: typeof value === 'string' ? value : '',
            },
            currentTarget: {
              checked: next === true,
            },
          } as unknown as ChangeEvent<HTMLInputElement>
          onChange(synthetic)
        }}
        className="mt-0.5"
      />
      <span>
        <span className="block font-semibold">{label}</span>
        {description ? (
          <span className="mt-1 block text-caption text-text-muted">{description}</span>
        ) : null}
      </span>
    </label>
  )
})
