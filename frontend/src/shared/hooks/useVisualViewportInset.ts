import { useEffect, useState } from 'react'

/**
 * Высота, на которую экранная клавиатура «съедает» видимую область снизу.
 * 0, когда клавиатура закрыта или API недоступен (используем как запасной
 * safe-area отступ в этом случае).
 */
export function useVisualViewportInset(): number {
  const [inset, setInset] = useState(0)

  useEffect(() => {
    const viewport = window.visualViewport
    if (!viewport) return

    const update = () => {
      const next = window.innerHeight - viewport.height - viewport.offsetTop
      setInset(Math.max(0, Math.round(next)))
    }

    update()
    viewport.addEventListener('resize', update)
    viewport.addEventListener('scroll', update)
    return () => {
      viewport.removeEventListener('resize', update)
      viewport.removeEventListener('scroll', update)
    }
  }, [])

  return inset
}
