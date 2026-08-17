import { useEffect, useRef, useState } from 'react'
import { clampSwipeOffset, resolveSwipeAction, resolveSwipeAxis } from '../lib/swipeGesture'
import type { SwipeAction, SwipeAxis } from '../lib/swipeGesture'

interface UseSwipeRowOptions {
  disabled?: boolean
  onComplete: () => void
  onTomorrow: () => void
}

interface SwipeGestureState {
  action: SwipeAction
  offsetX: number
}

const IDLE_STATE: SwipeGestureState = { action: null, offsetX: 0 }

/**
 * Обработчик touch-жеста строки агенды. Слушает события напрямую через
 * addEventListener (а не через onTouchMove в JSX), потому что React вешает
 * свой делегирующий обработчик touchmove как passive — preventDefault там не
 * останавливает прокрутку страницы, а нам нужно перехватывать её только
 * после залипания на горизонтальной оси.
 */
export function useSwipeRow({ disabled = false, onComplete, onTomorrow }: UseSwipeRowOptions) {
  const ref = useRef<HTMLLIElement>(null)
  const [state, setState] = useState<SwipeGestureState>(IDLE_STATE)
  const callbacksRef = useRef({ onComplete, onTomorrow })
  callbacksRef.current = { onComplete, onTomorrow }

  useEffect(() => {
    const node = ref.current
    if (!node || disabled) return

    let startX = 0
    let startY = 0
    let axis: SwipeAxis = 'undetermined'
    let action: SwipeAction = null

    const reset = () => {
      axis = 'undetermined'
      action = null
      setState(IDLE_STATE)
    }

    const onTouchStart = (event: TouchEvent) => {
      const touch = event.touches[0]
      if (!touch) return
      startX = touch.clientX
      startY = touch.clientY
      axis = 'undetermined'
      action = null
    }

    const onTouchMove = (event: TouchEvent) => {
      const touch = event.touches[0]
      if (!touch) return
      const dx = touch.clientX - startX
      const dy = touch.clientY - startY
      if (axis === 'undetermined') axis = resolveSwipeAxis(dx, dy)
      if (axis !== 'horizontal') return
      event.preventDefault()
      action = resolveSwipeAction(dx)
      setState({ action, offsetX: clampSwipeOffset(dx) })
    }

    const onTouchEnd = () => {
      if (axis === 'horizontal' && action) {
        if (action === 'complete') callbacksRef.current.onComplete()
        else callbacksRef.current.onTomorrow()
      }
      reset()
    }

    node.addEventListener('touchstart', onTouchStart, { passive: true })
    node.addEventListener('touchmove', onTouchMove, { passive: false })
    node.addEventListener('touchend', onTouchEnd)
    node.addEventListener('touchcancel', reset)

    return () => {
      node.removeEventListener('touchstart', onTouchStart)
      node.removeEventListener('touchmove', onTouchMove)
      node.removeEventListener('touchend', onTouchEnd)
      node.removeEventListener('touchcancel', reset)
    }
  }, [disabled])

  return { ref, action: state.action, offsetX: state.offsetX }
}
