import { forwardRef, useId } from 'react'
import type {
  ButtonHTMLAttributes,
  ChangeEvent,
  ElementType,
  HTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from 'react'
import { Button as RawButton } from './button'
import { Checkbox as RawCheckbox } from './checkbox'
import { Dialog, DialogContent, DialogTitle } from './dialog'
import { VisuallyHidden } from '@radix-ui/react-visually-hidden'
import { Input } from './input'
import { Label } from './label'
import { Skeleton } from './skeleton'
import { Textarea as RawTextarea } from './textarea'
import { cn } from '@/lib/utils'

type BadgeVariant = 'neutral' | 'primary' | 'success' | 'warning' | 'danger' | 'info'

const badgeVariants: Record<BadgeVariant, string> = {
  neutral: 'border-border bg-background-subtle/90 text-text-muted',
  primary: 'border-primary/25 bg-primary/10 text-primary',
  success: 'border-success/25 bg-success/10 text-success',
  warning: 'border-warning/25 bg-warning/10 text-warning',
  danger: 'border-danger/25 bg-danger/10 text-danger',
  info: 'border-info/25 bg-info/10 text-info',
}

type BadgeProps = HTMLAttributes<HTMLSpanElement> & { variant?: BadgeVariant }

export function Badge({ className, variant = 'neutral', ...props }: BadgeProps) {
  return <span className={cn('inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-caption backdrop-blur', badgeVariants[variant], className)} {...props} />
}

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'link'
type ButtonSize = 'sm' | 'md'
type ButtonShape = 'default' | 'pill' | 'none'

const buttonVariantMap: Record<ButtonVariant, 'default' | 'secondary' | 'ghost' | 'destructive' | 'link'> = {
  primary: 'default',
  secondary: 'secondary',
  ghost: 'ghost',
  danger: 'destructive',
  link: 'link',
}

const buttonSizeMap: Record<ButtonSize, 'default' | 'sm'> = {
  sm: 'sm',
  md: 'default',
}

const buttonVariantOverrides: Record<ButtonVariant, string> = {
  primary: 'bg-[image:var(--gradient-primary)] text-text-inverse shadow-elevated hover:brightness-[1.03] active:brightness-95',
  secondary: 'border border-border bg-surface/90 text-text shadow-surface backdrop-blur hover:border-border-strong hover:bg-surface-hover',
  ghost: 'text-text-muted hover:bg-background-subtle hover:text-text',
  danger: 'border border-danger/25 bg-danger/8 text-danger shadow-surface hover:border-danger/40 hover:bg-danger/12 hover:text-danger',
  link: 'min-h-0 rounded-none px-0 py-0 text-primary underline-offset-4 hover:text-primary-hover hover:underline',
}

const buttonSizeOverrides: Record<ButtonSize, string> = {
  sm: 'min-h-10 px-3.5 py-2 text-caption',
  md: 'min-h-11 px-4.5 py-2.5 text-button',
}

const buttonShapeClasses: Record<ButtonShape, string> = {
  default: 'rounded-control',
  pill: 'rounded-full',
  none: 'rounded-none',
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant
  size?: ButtonSize
  fullWidth?: boolean
  loading?: boolean
  shape?: ButtonShape
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { children, className, disabled, fullWidth = false, loading = false, size = 'md', type = 'button', variant = 'primary', shape = variant === 'link' ? 'none' : 'default', ...props },
  ref,
) {
  const isDisabled = disabled || loading
  return (
    <RawButton
      ref={ref}
      type={type}
      variant={buttonVariantMap[variant]}
      size={buttonSizeMap[size]}
      disabled={isDisabled}
      aria-busy={loading || undefined}
      className={cn(
        'font-semibold transition duration-fast ease-standard ring-1 ring-transparent',
        'disabled:cursor-not-allowed disabled:bg-disabled-bg disabled:text-disabled-text disabled:shadow-none disabled:ring-0',
        variant !== 'link' && buttonSizeOverrides[size],
        buttonShapeClasses[shape],
        buttonVariantOverrides[variant],
        fullWidth && 'w-full',
        className,
      )}
      {...props}
    >
      {loading ? 'Загрузка...' : children}
    </RawButton>
  )
})

type CardVariant = 'default' | 'elevated' | 'interactive'

const cardVariants: Record<CardVariant, string> = {
  default: 'border-border/90 bg-[image:var(--gradient-surface)] shadow-surface backdrop-blur',
  elevated: 'border-border/80 bg-surface-elevated shadow-elevated backdrop-blur',
  interactive: 'border-border/90 bg-[image:var(--gradient-surface)] shadow-surface backdrop-blur transition duration-fast ease-standard hover:-translate-y-0.5 hover:border-primary/35 hover:shadow-elevated',
}

type CardProps = HTMLAttributes<HTMLElement> & { as?: ElementType; variant?: CardVariant }

export function Card({ as: Component = 'div', className, variant = 'default', ...props }: CardProps) {
  return <Component className={cn('rounded-panel border p-6', cardVariants[variant], className)} {...props} />
}

type CheckboxProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'onChange' | 'checked'> & {
  description?: ReactNode
  label: ReactNode
  checked?: boolean
  onChange?: (event: ChangeEvent<HTMLInputElement>) => void
}

export const Checkbox = forwardRef<HTMLButtonElement, CheckboxProps>(function Checkbox({ className, description, disabled, label, id, checked, onChange, name, value }, ref) {
  const generatedId = useId()
  const inputId = id ?? generatedId
  return (
    <label htmlFor={inputId} className={cn('flex items-start gap-3 rounded-control border border-border bg-surface px-3 py-2 text-body-sm text-text transition-colors duration-fast ease-standard', disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer hover:border-border-strong hover:bg-surface-hover', className)}>
      <RawCheckbox
        ref={ref}
        id={inputId}
        name={name}
        value={value as string | undefined}
        checked={checked}
        disabled={disabled}
        onCheckedChange={(next) => {
          if (!onChange) return
          const synthetic = { target: { checked: next === true, name: name ?? '', value: typeof value === 'string' ? value : '' }, currentTarget: { checked: next === true } } as unknown as ChangeEvent<HTMLInputElement>
          onChange(synthetic)
        }}
        className="mt-0.5"
      />
      <span>
        <span className="block font-semibold">{label}</span>
        {description ? <span className="mt-1 block text-caption text-text-muted">{description}</span> : null}
      </span>
    </label>
  )
})

type ChipTone = 'neutral' | 'primary' | 'success' | 'warning' | 'danger' | 'info'

const chipTones: Record<ChipTone, { active: string; idle: string }> = {
  neutral: { active: 'border-border-strong bg-background-subtle/90 text-text', idle: 'border-border bg-surface/90 text-text-muted hover:border-border-strong hover:text-text' },
  primary: { active: 'border-primary/40 bg-primary/10 text-primary', idle: 'border-border bg-surface/90 text-text-muted hover:border-primary/35 hover:text-primary' },
  success: { active: 'border-success/40 bg-success/10 text-success', idle: 'border-border bg-surface/90 text-text-muted hover:border-success/35 hover:text-success' },
  warning: { active: 'border-warning/40 bg-warning/10 text-warning', idle: 'border-border bg-surface/90 text-text-muted hover:border-warning/35 hover:text-warning' },
  danger: { active: 'border-danger/40 bg-danger/10 text-danger', idle: 'border-border bg-surface/90 text-text-muted hover:border-danger/35 hover:text-danger' },
  info: { active: 'border-info/40 bg-info/10 text-info', idle: 'border-border bg-surface/90 text-text-muted hover:border-info/35 hover:text-info' },
}

type ChipProps = HTMLAttributes<HTMLSpanElement> & { active?: boolean; children: ReactNode; tone?: ChipTone }
type ChipButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean; tone?: ChipTone }

const chipBaseClass = 'inline-flex min-h-8 items-center gap-1.5 rounded-full border px-3 py-1 text-caption backdrop-blur transition duration-fast ease-standard'

export function Chip({ active = false, children, className, tone = 'neutral', ...props }: ChipProps) {
  return <span className={cn(chipBaseClass, active ? chipTones[tone].active : chipTones[tone].idle, className)} {...props}>{children}</span>
}

export function ChipButton({ active = false, children, className, tone = 'neutral', type = 'button', ...props }: ChipButtonProps) {
  return <button type={type} className={cn(chipBaseClass, active ? chipTones[tone].active : chipTones[tone].idle, className)} aria-pressed={active} {...props}>{children}</button>
}

type EmptyStateProps = { action?: { label: string; onClick: () => void }; children?: ReactNode; className?: string; title: ReactNode }

export function EmptyState({ action, children, className, title }: EmptyStateProps) {
  return (
    <div className={cn('rounded-[1.15rem] border border-dashed border-border bg-background-subtle/55 p-6 text-center backdrop-blur', className)}>
      <h2 className="text-h3 text-text">{title}</h2>
      {children ? <div className="mt-2 text-body-sm text-text-muted">{children}</div> : null}
      {action ? <Button type="button" onClick={action.onClick} className="mt-4">{action.label}</Button> : null}
    </div>
  )
}

type ErrorStateProps = { action?: { label: string; onClick: () => void }; children?: ReactNode; className?: string; title?: ReactNode }

export function ErrorState({ action, children, className, title = 'Что-то пошло не так' }: ErrorStateProps) {
  return (
    <div className={cn('rounded-[1.25rem] border border-danger/25 bg-danger/10 p-6 text-danger shadow-surface backdrop-blur', className)} role="alert">
      <h2 className="text-h3">{title}</h2>
      {children ? <div className="mt-2 text-body-sm text-danger/90">{children}</div> : null}
      {action ? <Button type="button" variant="danger" onClick={action.onClick} className="mt-4">{action.label}</Button> : null}
    </div>
  )
}

type FieldProps = { children: ReactNode; className?: string; error?: ReactNode; errorId?: string; hint?: ReactNode; hintId?: string; label: ReactNode; htmlFor?: string }

export function Field({ children, className, error, errorId, hint, hintId, htmlFor, label }: FieldProps) {
  return (
    <div className={cn('space-y-2', className)}>
      <Label htmlFor={htmlFor} className="block text-label uppercase tracking-[0.08em] text-text-muted">{label}</Label>
      {children}
      {hint ? <p id={hintId} className="text-caption text-text-muted">{hint}</p> : null}
      {error ? <p id={errorId} className="text-body-sm text-danger">{error}</p> : null}
    </div>
  )
}

type IconButtonVariant = 'neutral' | 'primary' | 'danger'

const iconButtonVariants: Record<IconButtonVariant, string> = {
  neutral: 'border-border bg-surface/90 text-text-muted shadow-surface backdrop-blur hover:border-border-strong hover:bg-surface-hover hover:text-text',
  primary: 'border-primary/25 bg-primary/10 text-primary shadow-surface hover:bg-primary/15 hover:text-primary',
  danger: 'border-danger/25 bg-danger/10 text-danger shadow-surface hover:bg-danger/15 hover:text-danger',
}

type IconButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: IconButtonVariant }

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton({ className, type = 'button', variant = 'neutral', ...props }, ref) {
  return <RawButton ref={ref} type={type} variant="outline" size="icon" className={cn('min-h-10 min-w-10 rounded-control border text-button transition duration-fast ease-standard disabled:cursor-not-allowed disabled:bg-disabled-bg disabled:text-disabled-text', iconButtonVariants[variant], className)} {...props} />
})

type ModalProps = { children: ReactNode; className?: string; footer?: ReactNode; labelledBy?: string; onClose: () => void; open: boolean; title: ReactNode }

export function Modal({ children, className, footer, labelledBy, onClose, open, title }: ModalProps) {
  const generatedTitleId = useId()
  const titleId = labelledBy ?? generatedTitleId
  const hasCustomPadding = className?.includes('p-0')
  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onClose() }}>
      <DialogContent showCloseButton={false} aria-labelledby={titleId} className={cn('w-full rounded-overlay border border-border/80 bg-[image:var(--gradient-surface)] shadow-overlay backdrop-blur', 'translate-x-[-50%] translate-y-[-50%]', 'data-[state=open]:animate-modal-content', className?.includes('max-w-') ? null : 'max-w-lg', hasCustomPadding ? null : 'p-6', className)}>
        {!hasCustomPadding && (
          <>
            <div className="flex items-start justify-between gap-4">
              <DialogTitle id={titleId} className="min-w-0 flex-1 break-words text-h3 text-text">{title}</DialogTitle>
              <button type="button" onClick={onClose} aria-label="Закрыть окно" className="inline-flex min-h-10 items-center justify-center rounded-control px-3.5 py-2 text-caption font-semibold text-text-muted hover:bg-background-subtle hover:text-text">x</button>
            </div>
            <div className="mt-4">{children}</div>
            {footer ? <div className="mt-6 flex flex-wrap justify-end gap-2">{footer}</div> : null}
          </>
        )}
        {hasCustomPadding && (
          <>
            <VisuallyHidden><DialogTitle id={titleId}>{title}</DialogTitle></VisuallyHidden>
            {children}
            {footer ? <div className="flex flex-wrap justify-end gap-2 p-4">{footer}</div> : null}
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

type PageShellWidth = 'sm' | 'md' | 'lg' | 'xl' | '2xl' | 'full'
type PageShellSpacing = 'none' | 'sm' | 'md'
type PageShellPadding = 'none' | 'default' | 'comfortable'

const pageShellWidthClasses: Record<PageShellWidth, string> = { sm: 'max-w-sm', md: 'max-w-md', lg: 'max-w-3xl', xl: 'max-w-5xl', '2xl': 'max-w-6xl', full: 'max-w-none' }
const pageShellSpacingClasses: Record<PageShellSpacing, string> = { none: '', sm: 'space-y-6', md: 'space-y-8' }
const pageShellPaddingClasses: Record<PageShellPadding, string> = { none: '', default: 'py-10', comfortable: 'py-12' }

type PageShellProps = HTMLAttributes<HTMLDivElement> & { children: ReactNode; contentClassName?: string; padding?: PageShellPadding; spacing?: PageShellSpacing; width?: PageShellWidth }

export function PageShell({ children, className, contentClassName, padding = 'default', spacing = 'md', width = 'xl', ...props }: PageShellProps) {
  return <div className={cn('min-h-screen bg-background/80 px-4 text-text sm:px-6', pageShellPaddingClasses[padding], className)} {...props}><div className={cn('mx-auto w-full', pageShellWidthClasses[width], pageShellSpacingClasses[spacing], contentClassName)}>{children}</div></div>
}

type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & { fullWidth?: boolean; invalid?: boolean }

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select({ className, disabled, fullWidth = true, invalid = false, ...props }, ref) {
  return <select ref={ref} disabled={disabled} aria-invalid={invalid || undefined} className={cn('min-h-11 rounded-control border border-border/90 bg-surface/90 px-3.5 py-2.5 text-body-sm text-text shadow-surface backdrop-blur transition duration-fast ease-standard', 'placeholder:text-text-muted disabled:cursor-not-allowed disabled:border-border disabled:bg-disabled-bg disabled:text-disabled-text', fullWidth && 'w-full', invalid ? 'border-danger/80 bg-danger/5' : 'hover:border-border-strong focus:border-primary/50', className)} {...props} />
})

type TextInputProps = InputHTMLAttributes<HTMLInputElement> & { fullWidth?: boolean; invalid?: boolean }

export const TextInput = forwardRef<HTMLInputElement, TextInputProps>(function TextInput({ className, disabled, fullWidth = true, invalid = false, ...props }, ref) {
  return <Input ref={ref} disabled={disabled} aria-invalid={invalid || undefined} className={cn('min-h-11 rounded-control border-border/90 bg-surface/90 px-4 py-2.5 text-body-sm text-text shadow-surface backdrop-blur transition duration-fast ease-standard', 'placeholder:text-text-muted/90 disabled:cursor-not-allowed disabled:border-border disabled:bg-disabled-bg disabled:text-disabled-text', fullWidth && 'w-full', invalid ? 'border-danger/80 bg-danger/5' : 'hover:border-border-strong focus:border-primary/50', className)} {...props} />
})

type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea({ className, disabled, invalid = false, ...props }, ref) {
  return <RawTextarea ref={ref} disabled={disabled} aria-invalid={invalid || undefined} className={cn('w-full rounded-control border-border/90 bg-surface/90 px-4 py-3 text-body-sm text-text shadow-surface backdrop-blur transition duration-fast ease-standard', 'placeholder:text-text-muted disabled:cursor-not-allowed disabled:border-border disabled:bg-disabled-bg disabled:text-disabled-text', invalid ? 'border-danger/80 bg-danger/5' : 'hover:border-border-strong focus:border-primary/50', className)} {...props} />
})

export { Skeleton }
