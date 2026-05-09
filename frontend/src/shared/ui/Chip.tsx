import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from 'react'
import { cn } from '../lib/cn'

type ChipTone = 'neutral' | 'primary' | 'success' | 'warning' | 'danger' | 'info'

const chipTones: Record<ChipTone, { active: string; idle: string }> = {
  neutral: {
    active: 'border-border-strong bg-surface-hover text-text',
    idle: 'border-border bg-surface text-text-muted hover:border-border-strong hover:text-text',
  },
  primary: {
    active: 'border-primary/50 bg-primary/10 text-primary',
    idle: 'border-border bg-surface text-text-muted hover:border-primary/40 hover:text-primary',
  },
  success: {
    active: 'border-success/50 bg-success/10 text-success',
    idle: 'border-border bg-surface text-text-muted hover:border-success/40 hover:text-success',
  },
  warning: {
    active: 'border-warning/50 bg-warning/10 text-warning',
    idle: 'border-border bg-surface text-text-muted hover:border-warning/40 hover:text-warning',
  },
  danger: {
    active: 'border-danger/50 bg-danger/10 text-danger',
    idle: 'border-border bg-surface text-text-muted hover:border-danger/40 hover:text-danger',
  },
  info: {
    active: 'border-info/50 bg-info/10 text-info',
    idle: 'border-border bg-surface text-text-muted hover:border-info/40 hover:text-info',
  },
}

type ChipProps = HTMLAttributes<HTMLSpanElement> & {
  active?: boolean
  children: ReactNode
  tone?: ChipTone
}

type ChipButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  active?: boolean
  tone?: ChipTone
}

const baseClass = 'inline-flex min-h-8 items-center gap-1.5 rounded-full border px-3 py-1 text-caption transition-colors duration-fast ease-standard'

export function Chip({ active = false, children, className, tone = 'neutral', ...props }: ChipProps) {
  return (
    <span className={cn(baseClass, active ? chipTones[tone].active : chipTones[tone].idle, className)} {...props}>
      {children}
    </span>
  )
}

export function ChipButton({ active = false, children, className, tone = 'neutral', type = 'button', ...props }: ChipButtonProps) {
  return (
    <button
      type={type}
      className={cn(baseClass, active ? chipTones[tone].active : chipTones[tone].idle, className)}
      aria-pressed={active}
      {...props}
    >
      {children}
    </button>
  )
}
