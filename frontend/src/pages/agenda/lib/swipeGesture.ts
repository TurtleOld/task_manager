/**
 * Чистая логика свайпа строки агенды: свайп вправо — «Готово», влево —
 * «Завтра». Ось «залипает» после первых нескольких пикселей движения, чтобы
 * вертикальная прокрутка списка не путалась со свайпом (§4 тикета 10).
 */

export const SWIPE_AXIS_LOCK_PX = 8
export const SWIPE_ACTION_THRESHOLD_PX = 72
export const SWIPE_MAX_OFFSET_PX = 120

export type SwipeAxis = 'horizontal' | 'vertical' | 'undetermined'
export type SwipeAction = 'complete' | 'tomorrow' | null

/**
 * Определяет ось жеста по накопленному смещению от точки касания.
 * Пока оба смещения меньше порога залипания — ось не определена (палец
 * мог только-только коснуться экрана). При диагональном движении с равными
 * смещениями выигрывает вертикаль — так безопаснее для случайной прокрутки.
 */
export function resolveSwipeAxis(dx: number, dy: number): SwipeAxis {
  const absX = Math.abs(dx)
  const absY = Math.abs(dy)
  if (absX < SWIPE_AXIS_LOCK_PX && absY < SWIPE_AXIS_LOCK_PX) return 'undetermined'
  return absX > absY ? 'horizontal' : 'vertical'
}

/** Ограничивает визуальное смещение строки, чтобы она не улетала за экран. */
export function clampSwipeOffset(dx: number): number {
  return Math.max(-SWIPE_MAX_OFFSET_PX, Math.min(SWIPE_MAX_OFFSET_PX, dx))
}

/** Действие, которое сработает, если отпустить палец при данном смещении. */
export function resolveSwipeAction(dx: number): SwipeAction {
  if (dx >= SWIPE_ACTION_THRESHOLD_PX) return 'complete'
  if (dx <= -SWIPE_ACTION_THRESHOLD_PX) return 'tomorrow'
  return null
}
