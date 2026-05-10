import type { HTMLAttributes, ReactNode } from 'react'
import { cn } from '@/lib/utils'

type PageShellWidth = 'sm' | 'md' | 'lg' | 'xl' | '2xl' | 'full'
type PageShellSpacing = 'none' | 'sm' | 'md'
type PageShellPadding = 'none' | 'default' | 'comfortable'

const widthClasses: Record<PageShellWidth, string> = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-3xl',
  xl: 'max-w-5xl',
  '2xl': 'max-w-6xl',
  full: 'max-w-none',
}

const spacingClasses: Record<PageShellSpacing, string> = {
  none: '',
  sm: 'space-y-6',
  md: 'space-y-8',
}

const paddingClasses: Record<PageShellPadding, string> = {
  none: '',
  default: 'py-10',
  comfortable: 'py-12',
}

type PageShellProps = HTMLAttributes<HTMLDivElement> & {
  children: ReactNode
  contentClassName?: string
  padding?: PageShellPadding
  spacing?: PageShellSpacing
  width?: PageShellWidth
}

export function PageShell({ children, className, contentClassName, padding = 'default', spacing = 'md', width = 'xl', ...props }: PageShellProps) {
  return (
    <div className={cn('min-h-screen bg-background/80 px-4 text-text sm:px-6', paddingClasses[padding], className)} {...props}>
      <div className={cn('mx-auto w-full', widthClasses[width], spacingClasses[spacing], contentClassName)}>{children}</div>
    </div>
  )
}
