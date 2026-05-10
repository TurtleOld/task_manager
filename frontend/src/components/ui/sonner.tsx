import { useEffect, useState } from 'react'
import { Toaster as Sonner, type ToasterProps } from 'sonner'

const Toaster = ({ ...props }: ToasterProps) => {
  const [theme, setTheme] = useState<ToasterProps['theme']>('system')

  useEffect(() => {
    if (typeof window === 'undefined') return
    const html = document.documentElement
    const resolve = (): ToasterProps['theme'] =>
      html.classList.contains('dark') ? 'dark' : 'light'
    setTheme(resolve())
    const observer = new MutationObserver(() => setTheme(resolve()))
    observer.observe(html, { attributes: true, attributeFilter: ['class'] })
    return () => observer.disconnect()
  }, [])

  return (
    <Sonner
      theme={theme}
      className="toaster group"
      style={
        {
          '--normal-bg': 'rgb(var(--popover))',
          '--normal-text': 'rgb(var(--popover-foreground))',
          '--normal-border': 'rgb(var(--color-border))',
        } as React.CSSProperties
      }
      {...props}
    />
  )
}

export { Toaster }
